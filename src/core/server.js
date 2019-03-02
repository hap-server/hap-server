import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';
import EventEmitter from 'events';

import express from 'express';
import WebSocket from 'ws';
import persist from 'node-persist';

import {uuid} from 'hap-nodejs';

import Connection from './connection';
import PluginManager from './plugins';
import Bridge from './bridge';
import Homebridge from './homebridge';
import Logger from './logger';

export default class Server extends EventEmitter {
    constructor(config, storage, log) {
        super();

        this.config = config;
        this.storage = storage;
        this.log = log || new Logger();

        this.accessories = [];
        this.bridges = [];

        this.app = express();
        this.app.use(express.static(path.resolve(__dirname, '..', 'public')));

        this.wss = new WebSocket.Server({noServer: true});
        this.wss.on('connection', ws => this.handleWebsocketConnection(ws));

        this.handle = this.handle.bind(this);
        this.upgrade = this.upgrade.bind(this);

        const console_log = console.log;
        const console_error = console.error;

        console.log = (data, ...args) => {
            for (const ws of this.wss.clients) {
                const connection = Connection.getConnectionForWebSocket(ws);
                if (connection && connection.enable_proxy_stdout) {
                    ws.send('**:' + JSON.stringify({type: 'stdout', data: data + '\n'}));
                }
            }

            console_log(data, ...args);
        };
        console.error = (data, ...args) => {
            for (const ws of this.wss.clients) {
                const connection = Connection.getConnectionForWebSocket(ws);
                if (connection && connection.enable_proxy_stdout) {
                    ws.send('**:' + JSON.stringify({type: 'stderr', data: data + '\n'}));
                }
            }

            console_error(data, ...args);
        };
    }

    static async createServer(config) {
        if (!config) config = {};

        const ui_storage_path = path.resolve(config.data_path, 'ui-storage');

        const storage = persist.create({
            dir: ui_storage_path,
            stringify: data => JSON.stringify(data, null, 4),
        });

        await storage.init();

        const server = new this(config.config, storage);

        return server;
    }

    loadBridgesFromConfig() {
        if (!this.config.bridges) return Promise.resolve();

        return Promise.all(this.config.bridges.map(bridge_config => this.loadBridge(bridge_config)));
    }

    loadBridge(bridge_config) {
        // bridge_config.username is required - all other properties are optional
        const name = bridge_config.username || 'Bridge ' + bridge_config.username.match(/(.{2}\:.{2})$/)[1];

        const bridge = new Bridge(this, this.log.withPrefix(name), {
            uuid: bridge_config.uuid || uuid.generate('hap-server:bridge:' + bridge_config.username),
            name,
            username: bridge_config.username,
            port: bridge_config.port,
            pincode: bridge_config.pincode,
            unauthenticated_access: bridge_config.unauthenticated_access,
        });

        bridge.accessory_uuids = bridge_config.accessories || [];

        this.bridges.push(bridge);

        for (const accessory_uuid of bridge.accessory_uuids) {
            if (accessory_uuid instanceof Array) {
                const accessory = this.accessories.find(accessory => accessory_uuid[0] === accessory.plugin.name &&
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (!accessory) continue;

                bridge.addAccessory(accessory.accessory);
            } else {
                const accessory = this.accessories.find(accessory => accessory.uuid === accessory_uuid);
                if (!accessory) continue;

                bridge.addAccessory(accessory.accessory);
            }
        }
    }

    loadHomebridge() {
        if (this.homebridge) return;

        // config.bridge, config.accessories and config.platforms are for Homebridge
        // If any of these exist, the user wants to run Homebridge as well
        this.homebridge = new Homebridge(this, this.log.withPrefix('Homebridge'), {
            bridge: this.config.bridge,
            accessories: this.config.accessories,
            platforms: this.config.platforms,
        });

        this.bridges.push(this.homebridge);
    }

    async loadAccessoriesFromConfig() {
        await this.loadAccessories(this.config.accessories2 || [], true);
    }

    async loadAccessories(accessories, dont_throw) {
        await Promise.all(accessories.map(accessory_config => this.loadAccessory(accessory_config).catch(err => {
            if (!dont_throw) throw err;

            this.log.warn('Error loading accessory', accessory_config.plugin, accessory_config.accessory,
                accessory_config.name, err);
        })));
    }

    async loadAccessory(accessory_config) {
        const {plugin: plugin_name, accessory: accessory_type, name} = accessory_config;

        if (!plugin_name || !accessory_type || !name) throw new Error('Invalid accessory configuration: accessories'
            + ' must have the plugin, accessory and name properties');

        const plugin = PluginManager.getPlugin(plugin_name);
        if (!plugin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const accessory_handler = plugin.getAccessoryHandler(accessory_type);
        if (!accessory_handler) throw new Error('No accessory handler with the name "' + accessory_type + '"');

        if (!accessory_config.uuid) accessory_config.uuid = uuid.generate('accessory:' + plugin_name + ':' +
            accessory_type + ':' + name);

        const accessory = await accessory_handler.call(plugin, accessory_config);

        if (this.getAccessory(accessory.UUID)) throw new Error('Already have an accessory with the UUID "' +
            accessory.UUID + '"');

        const plugin_accessory = new PluginAccessory(this, accessory, plugin, accessory_type);

        this.accessories.push(plugin_accessory);

        for (let bridge of this.bridges.filter(bridge => bridge.accessory_uuids.find(accessory_uuid =>
            accessory_uuid instanceof Array ? accessory_uuid[0] === plugin_name &&
                accessory_uuid[1] === accessory_type && accessory_uuid[2] === name :
                accessory_uuid === accessory_config.uuid
        ))) {
            bridge.addAccessory(accessory);
        }
    }

    async loadAccessoryPlatformsFromConfig() {
        await this.loadAccessoryPlatforms(this.config.platforms2 || [], true);
    }

    async loadAccessoryPlatforms(accessories, dont_throw) {
        await Promise.all(accessories.map(accessory_platform_config =>
            this.loadAccessory(accessory_platform_config).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading accessory platform', accessory_platform_config.plugin,
                    accessory_platform_config.platform, accessory_platform_config.name, err);
            })));
    }

    publish() {
        for (const bridge of this.bridges) {
            bridge.publish();
        }
    }

    unpublish() {
        for (const bridge of this.bridges) {
            bridge.unpublish();
        }
    }

    getAccessory(uuid) {
        const plugin_accessory = this.getPluginAccessory(uuid);

        if (plugin_accessory) return plugin_accessory.accessory;

        for (const bridge of this.bridges) {
            if (!bridge instanceof Homebridge) continue;
            if (bridge.uuid === uuid) return bridge.bridge;

            for (const accessory of bridge.bridge.bridgedAccessories) {
                if (accessory.UUID === uuid) return accessory;
            }
        }
    }

    getPluginAccessory(uuid) {
        return this.accessories.find(accessory => accessory.uuid === uuid);
    }

    createServer(options) {
        const server = http.createServer(this.handle, options);

        server.on('upgrade', this.upgrade);

        return server;
    }

    createSecureServer(options) {
        const server = https.createServer(this.handle, options);

        server.on('upgrade', this.upgrade);

        return server;
    }

    handle(req, res, next) {
        if (url.parse(req.url).pathname === '/websocket') {
            // If path is /websocket tell the client to upgrade the request
            const body = http.STATUS_CODES[426];

            res.writeHead(426, {
                'Content-Length': body.length,
                'Content-Type': 'text/plain',
            });

            res.end(body);
        } else {
            // Send all other requests to Express
            this.app.handle(req, res, next);
        }
    }

    upgrade(request, socket, head) {
        if (url.parse(request.url).pathname !== '/websocket') {
            socket.destroy();
        }

        this.wss.handleUpgrade(request, socket, head, ws => {
            this.wss.emit('connection', ws, request);
        });
    }

    handleWebsocketConnection(ws) {
        new Connection(this, ws);
    }

    /**
     * Sends a broadcast message.
     *
     * @param {any} data
     * @param {Array} except An array of WebSocket clients to not send the message to
     */
    sendBroadcast(data, except) {
        const message = '**:' + JSON.stringify(data);

        for (const ws of this.wss.clients) {
            if (ws.readyState !== WebSocket.OPEN) continue;
            if (except && except === ws || except instanceof Array && except.includes(ws)) continue;

            ws.send(message);
        }
    }

    handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context) {
        this.sendBroadcast({
            type: 'update-characteristic',
            accessory_uuid: accessory.UUID,
            service_id: service.UUID + (service.subtype ? '.' + service.subtype : ''),
            characteristic_id: characteristic.UUID,
            details: Object.assign({}, characteristic.toHAP(), {
                // Make sure the value is set (for event only characteristics)
                value,
            }),
        });
    }
}

export class PluginAccessory {
    constructor(server, accessory, plugin, accessory_type) {
        this.server = server;
        this.accessory = accessory;
        this.plugin = plugin;
        this.accessory_type = accessory_type;
    }

    get uuid() {
        return this.accessory.UUID;
    }
}

export class PluginAccessoryPlatformAccessory extends PluginAccessory {
    constructor(server, accessory, plugin, accessory_platform) {
        super(server, accessory, plugin);

        this.accessory_platform = accessory_platform;
    }
}
