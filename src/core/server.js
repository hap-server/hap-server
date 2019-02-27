import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';
import EventEmitter from 'events';

import express from 'express';
import WebSocket from 'ws';
import persist from 'node-persist';

import hap, {uuid} from 'hap-nodejs';

import Connection from './connection';
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

        // this.bridge = new Bridge(this, this.log.withPrefix('HAP Bridge'), {
        //     uuid: uuid.generate('HomeBridge'),
        //     // username: bridgeConfig.username || 'CC:22:3D:E3:CE:30',
        //     // port: bridgeConfig.port || 0,
        //     // pincode: bridgeConfig.pin || '031-45-154',
        //     // category: Accessory.Categories.BRIDGE,
        //     // mdns: this._config.mdns,
        //     allow_insecure_access: false,
        // });
        this.homebridge = new Homebridge(this, this.log.withPrefix('Homebridge'), {
            // uuid: uuid.generate('HomeBridge'),
            bridge: config.homebridge || config.bridge,
            accessories: config['homebridge-accessories'] || config.accessories,
            platforms: config['homebridge-platforms'] || config.platforms,
        });

        this.bridges.push(this.homebridge);

        this.bridge = new Bridge(this, this.log.withPrefix('HAP Bridge'), {
            uuid: uuid.generate('HomeBridge'),
            // name: 'Bridge #1',
            // username: bridgeConfig.username || 'CC:22:3D:E3:CE:30',
            username: '00:00:00:00:00:01',
            // port: bridgeConfig.port || 0,
            // pincode: bridgeConfig.pin || '031-45-154',
            // category: Accessory.Categories.BRIDGE,
            // mdns: this._config.mdns,
            allow_insecure_access: false,
        });

        this.bridges.push(this.bridge);

        this.handle = this.handle.bind(this);
        this.upgrade = this.upgrade.bind(this);

        const console_log = console.log;
        const console_error = console.error;

        console.log = (data, ...args) => {
            for (let ws of this.wss.clients) {
                const connection = Connection.getConnectionForWebSocket(ws);
                if (connection && connection.enable_proxy_stdout)
                    ws.send('**:' + JSON.stringify({type: 'stdout', data: data + '\n'}));
            }

            console_log(data, ...args);
        };
        console.error = (data, ...args) => {
            for (let ws of this.wss.clients) {
                const connection = Connection.getConnectionForWebSocket(ws);
                if (connection && connection.enable_proxy_stdout)
                    ws.send('**:' + JSON.stringify({type: 'stderr', data: data + '\n'}));
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

    publish() {
        for (let bridge of this.bridges) {
            bridge.publish();
        }
    }

    getAccessory(uuid) {
        const plugin_accessory = this.getPluginAccessory(uuid);

        if (plugin_accessory) return plugin_accessory.accessory;

        for (let bridge of this.bridges) {
            if (!bridge instanceof Homebridge) continue;
            if (bridge.uuid === uuid) return bridge.bridge;

            for (let accessory of bridge.bridge.bridgedAccessories) {
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
        const connection = new Connection(this, ws);
    }

    /**
     * Sends a broadcast message.
     *
     * @param {any} data
     * @param {Array} except An array of WebSocket clients to not send the message to
     */
    sendBroadcast(data, except) {
        const message = '**:' + JSON.stringify(data);

        for (let ws of this.wss.clients) {
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
