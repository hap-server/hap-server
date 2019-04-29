import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';
import EventEmitter from 'events';
import fs from 'fs';
import os from 'os';

import express from 'express';
import WebSocket from 'ws';
import persist from 'node-persist';
import csp from 'express-csp';
import cookieParser from 'cookie-parser';
import multer from 'multer';

import {uuid} from 'hap-nodejs';

import Connection from './connection';
import PluginManager from './plugins';
import Bridge from './bridge';
import Homebridge from './homebridge';
import Logger from './logger';
import {Accessory, Service, Characteristic} from './hap-async';

import Automations from '../automations';

const DEVELOPMENT = true;

export default class Server extends EventEmitter {
    /**
     * Creates a Server.
     *
     * @param {object} options
     * @param {string} options.data_path
     * @param {string} options.config_path
     * @param {object} options.config
     * @param {string} options.cli_auth_token
     * @param {node-persist} storage
     * @param {Logger} [log]
     */
    constructor(options, storage, log) {
        super();

        this.config = options.config || {};
        this.cli_auth_token = options.cli_auth_token;
        this.storage = storage;
        this.log = log || new Logger();

        this.accessories = [];
        this.cached_accessories = [];
        this.bridges = [];

        this.app = express();

        csp.extend(this.app, {
            policy: {
                directives: {
                    'default-src': ['none'],
                    'script-src': ['self', 'unsafe-eval'],
                    'connect-src': ['self', '*'],
                    'style-src': DEVELOPMENT ? ['self', 'unsafe-inline'] : ['self'],
                    'img-src': ['self', 'data:'],
                },
            },
        });

        this.assets_path = path.resolve(options.data_path, 'assets');

        this.app.use('/assets', cookieParser(), Connection.authoriseAssetRequest.bind(Connection, this));
        this.app.use('/assets', (req, res, next) => {
            res.setHeader('Cache-Control', 'private, max-age=31536000');
            next();
        }, express.static(this.assets_path));

        this.multer = multer({dest: os.tmpdir()});
        this.app.post('/assets/upload-layout-background', this.multer.single('background'),
            Connection.handleUploadLayoutBackground.bind(Connection, this));

        if (!DEVELOPMENT || !options.webpack_hot) {
            this.app.use(express.static(path.resolve(__dirname, '..', 'public')));
        }

        if (DEVELOPMENT && options.webpack_hot) {
            const webpack = require('webpack');
            const devmiddleware = require('webpack-dev-middleware');
            const hotmiddleware = require('webpack-hot-middleware');
            require('babel-register');

            const compiler = webpack(require('../../gulpfile.babel').webpack_hot_config);

            this.app.use(devmiddleware(compiler));
            this.app.use(hotmiddleware(compiler));
        }

        this.wss = new WebSocket.Server({noServer: true});
        this.wss.on('connection', (ws, req) => this.handleWebsocketConnection(ws, req));

        this.handle = this.handle.bind(this);
        this.upgrade = this.upgrade.bind(this);
        this._handleCharacteristicUpdate = (default_accessory, event) => {
            // this.log.info('Updating characteristic', event);
            this.handleCharacteristicUpdate(event.accessory || default_accessory, event.service,
                event.characteristic, event.newValue, event.oldValue, event.context);
        };

        Server.instances.add(this);
    }

    /**
     * Creates a Server.
     *
     * @param {object} options
     * @param {string} options.data_path
     * @param {string} options.config_path
     * @param {object} options.config
     * @param {string} options.cli_auth_token
     * @return {Server}
     */
    static async createServer(options) {
        if (!options) options = {};

        const ui_storage_path = path.resolve(options.data_path, 'ui-storage');

        const storage = persist.create({
            dir: ui_storage_path,
            stringify: data => JSON.stringify(data, null, 4),
        });

        await storage.init();

        const server = new this(options, storage);

        return server;
    }

    static patchStdout() {
        const console_log = console.log;
        const console_error = console.error;

        console.log = (data, ...args) => {
            for (const server of Server.instances) {
                for (const ws of server.wss.clients) {
                    const connection = Connection.getConnectionForWebSocket(ws);
                    if (connection && connection.enable_proxy_stdout) {
                        ws.send('**:' + JSON.stringify({type: 'stdout', data: data + '\n'}));
                    }
                }
            }

            console_log(data, ...args);
        };
        console.error = (data, ...args) => {
            for (const server of Server.instances) {
                for (const ws of server.wss.clients) {
                    const connection = Connection.getConnectionForWebSocket(ws);
                    if (connection && connection.enable_proxy_stdout) {
                        ws.send('**:' + JSON.stringify({type: 'stderr', data: data + '\n'}));
                    }
                }
            }

            console_error(data, ...args);
        };
    }

    loadBridgesFromConfig() {
        if (!this.config.bridges) return Promise.resolve();

        return Promise.all(this.config.bridges.map(bridge_config => this.loadBridge(bridge_config)));
    }

    loadBridge(bridge_config) {
        // bridge_config.username is required - all other properties are optional
        const name = bridge_config.name || 'Bridge ' + bridge_config.username.match(/(.{2}\:.{2})$/)[1];

        const bridge = new Bridge(this, this.log.withPrefix(name), {
            uuid: bridge_config.uuid || uuid.generate('hap-server:bridge:' + bridge_config.username),
            name,
            username: bridge_config.username,
            port: bridge_config.port,
            pincode: bridge_config.pincode,
            unauthenticated_access: bridge_config.unauthenticated_access,

            accessory_uuids: bridge_config.accessories,
        });

        this.bridges.push(bridge);

        for (const accessory_uuid of bridge.accessory_uuids) {
            if (accessory_uuid instanceof Array) {
                const accessory = this.accessories.find(accessory => accessory_uuid[0] === accessory.plugin.name &&
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (accessory) bridge.addAccessory(accessory.accessory);

                const cached_accessory = this.cached_accessories.find(accessory => accessory_uuid[0] === accessory.plugin.name &&
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (cached_accessory) bridge.addCachedAccessory(cached_accessory.accessory);
            } else {
                const accessory = this.accessories.find(accessory => accessory.uuid === accessory_uuid);
                if (accessory) bridge.addAccessory(accessory.accessory);

                const cached_accessory = this.cached_accessories.find(accessory => accessory.uuid === accessory_uuid);
                if (cached_accessory) bridge.addCachedAccessory(accessory.cached_accessory);
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

    async loadCachedAccessories() {
        const cached_accessories = await this.storage.getItem('CachedAccessories') || [];

        await Promise.all(cached_accessories.map(cache => this.loadCachedAccessory(cache)));
    }

    async loadCachedAccessory(cache) {
        const plugin_accessory = PluginAccessory.restore(this, cache);

        this.cached_accessories.push(plugin_accessory);

        // this.log.debug('Loaded cached accessory', plugin_accessory.accessory.displayName, plugin_accessory.uuid, cache.plugin, cache.accessory_type);

        for (const bridge of this.bridges.filter(bridge => bridge.accessory_uuids.find(accessory_uuid =>
            accessory_uuid instanceof Array ? accessory_uuid[0] === cache.plugin &&
                accessory_uuid[1] === cache.accessory_type &&
                accessory_uuid[2] === cache.accessory.displayName :
                accessory_uuid === plugin_accessory.uuid
        ))) {
            bridge.addCachedAccessory(plugin_accessory.accessory);
        }
    }

    getCachedAccessory(uuid) {
        return this.cached_accessories.find(accessory => accessory.uuid === uuid);
    }

    removeCachedAccessory(uuid) {
        let index;
        while ((index = this.cached_accessories.findIndex(accessory => accessory.uuid === uuid)) !== -1) {
            this.cached_accessories.splice(index, 1);
        }
    }

    async saveCachedAccessories() {
        const cached_accessories = await Promise.all(this.accessories.concat(this.cached_accessories)
            .map(accessory => accessory.cache()));

        await this.storage.setItem('CachedAccessories', cached_accessories);
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

        // eslint-disable-next-line curly
        if (!plugin_name || !accessory_type || !name) throw new Error('Invalid accessory configuration: accessories'
            + ' must have the plugin, accessory and name properties');

        const plugin = PluginManager.getPlugin(plugin_name);
        if (!plugin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const accessory_handler = plugin.getAccessoryHandler(accessory_type);
        if (!accessory_handler) throw new Error('No accessory handler with the name "' + accessory_type + '"');

        // eslint-disable-next-line curly
        if (!accessory_config.uuid) accessory_config.uuid = uuid.generate('accessory:' + plugin_name + ':' +
            accessory_type + ':' + name);

        const cached_accessory = this.getCachedAccessory(accessory_config.uuid);

        const accessory = await accessory_handler.call(plugin, accessory_config,
            cached_accessory ? cached_accessory.accessory : undefined);

        accessory.on('service-characteristic-change', event => {
            this.handleCharacteristicUpdate(event.accessory || accessory, event.service,
                event.characteristic, event.newValue, event.oldValue, event.context);
        });

        // eslint-disable-next-line curly
        if (this.accessories.find(a => a.uuid === accessory.UUID)) throw new Error('Already have an accessory with' +
            ' the UUID "' + accessory.UUID + '"');

        const plugin_accessory = new PluginAccessory(this, accessory, plugin, accessory_type);

        this.removeCachedAccessory(accessory.UUID);

        this.accessories.push(plugin_accessory);

        for (const bridge of this.bridges.filter(bridge => bridge.accessory_uuids.find(accessory_uuid =>
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
            this.loadAccessoryPlatform(accessory_platform_config).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading accessory platform', accessory_platform_config.plugin,
                    accessory_platform_config.platform, accessory_platform_config.name, err);
            })));
    }

    async loadAccessoryPlatform(config) {
        throw new Error('Not implemented');
    }

    get automations() {
        return Object.defineProperty(this, 'automations', {value: new Automations(this)}).automations;
    }

    async loadAutomationTriggersFromConfig(dont_throw) {
        if (this.config_automation_triggers) return this.config_automation_triggers;
        this.config_automation_triggers = {};

        await Promise.all(Object.entries(this.config['automation-triggers'] || {}).map(([key, config]) =>
            this.automations.loadAutomationTrigger(config).then(t => this.config_automation_triggers[key] = t).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation trigger', config.plugin, config.trigger, err);
            })));

        return this.config_automation_triggers;
    }

    async loadAutomationConditionsFromConfig(dont_throw) {
        if (this.config_automation_conditions) return this.config_automation_conditions;
        this.config_automation_conditions = {};

        await Promise.all(Object.entries(this.config['automation-conditions'] || {}).map(([key, config]) =>
            this.automations.loadAutomationCondition(config).then(t => this.config_automation_conditions[key] = t).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation condition', config.plugin, config.condition, err);
            })));

        return this.config_automation_conditions;
    }

    async loadAutomationActionsFromConfig(dont_throw) {
        if (this.config_automation_actions) return this.config_automation_actions;
        this.config_automation_actions = {};

        await Promise.all(Object.entries(this.config['automation-actions'] || {}).map(([key, config]) =>
            this.automations.loadAutomationAction(config).then(t => this.config_automation_actions[key] = t).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation action', config.plugin, config.action, err);
            })));

        return this.config_automation_actions;
    }

    async loadAutomationsFromConfig(dont_throw) {
        const [triggers, conditions, actions] = await Promise.all([
            this.loadAutomationTriggersFromConfig(dont_throw),
            this.loadAutomationConditionsFromConfig(dont_throw),
            this.loadAutomationActionsFromConfig(dont_throw),
        ]);

        const automations = await Promise.all((this.config.automations || []).map(config =>
            this.automations.loadAutomation(config).then(automation => {
                automation.addTrigger(...(automation.config.triggers || []).map(key => triggers[key]));
                automation.addCondition(...(automation.config.conditions || []).map(key => conditions[key]));
                automation.addAction(...(automation.config.actions || []).map(key => actions[key]));

                return automation;
            }).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation', config, err);
            })));

        this.log.info('Loaded automations', automations);

        return {automations, triggers, conditions, actions};
    }

    /**
     * Gets an Automation.
     *
     * @param {number} id
     * @return {Automation}
     */
    getAutomation(id) {
        if (!this.hasOwnProperty('automations')) return null;

        return this.automations.getAutomation(id);
    }

    /**
     * Publishes all HAP bridges.
     */
    publish() {
        for (const bridge of this.bridges) {
            bridge.publish();
        }
    }

    /**
     * Unpublishes all HAP bridges.
     */
    unpublish() {
        for (const bridge of this.bridges) {
            bridge.unpublish();
        }
    }

    /**
     * Gets an Accessory.
     *
     * @param {string} uuid
     * @return {Accessory}
     */
    getAccessory(uuid) {
        const plugin_accessory = this.getPluginAccessory(uuid);

        if (plugin_accessory) return plugin_accessory.accessory;

        const cached_plugin_accessory = this.getCachedAccessory(uuid);

        if (cached_plugin_accessory) return cached_plugin_accessory.accessory;

        for (const bridge of this.bridges) {
            if (bridge.uuid === uuid) return bridge.bridge;

            // eslint-disable-next-line curly
            if (bridge instanceof Homebridge) for (const accessory of bridge.bridge.bridgedAccessories) {
                if (accessory.UUID === uuid) return accessory;
            }
        }
    }

    /**
     * Gets a PluginAccessory.
     *
     * @param {string} uuid
     * @return {PluginAccessory}
     */
    getPluginAccessory(uuid) {
        return this.accessories.find(accessory => accessory.uuid === uuid);
    }

    /**
     * Gets a Service.
     *
     * @param {(string|Array)} uuid
     * @param {string} [service_uuid]
     * @return {Service}
     */
    getService(uuid, service_uuid) {
        if (uuid instanceof Array) [uuid, service_uuid] = uuid;

        const accessory_uuid = uuid.split('.')[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);

        const service_type = service_uuid.split('.')[0];
        const service_subtype = service_uuid.substr(service_type.length + 1);

        const accessory = this.getAccessory(accessory_uuid);
        if (!accessory) return;

        return accessory.services.find(s => s.UUID === service_type && s.subtype === service_subtype);
    }

    /**
     * Gets a Characteristic.
     *
     * @param {(string|Array)} uuid
     * @param {string} [service_uuid]
     * @param {string} [characteristic_uuid]
     * @return {Characteristic}
     */
    getCharacteristic(uuid, service_uuid, characteristic_uuid) {
        if (uuid instanceof Array) [uuid, service_uuid, characteristic_uuid] = uuid;

        const accessory_uuid = uuid.split('.')[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);
        if (!characteristic_uuid) characteristic_uuid = service_uuid.substr(service_uuid.lastIndexOf('.') + 1), service_uuid = service_uuid.substr(0, service_uuid.lastIndexOf('.'));

        const service = this.getService(accessory_uuid, service_uuid);
        if (!service) return;

        return service.characteristics.find(s => s.UUID === characteristic_uuid);
    }

    /**
     * Creates a HTTP server.
     *
     * @param {object} options
     * @return {http.Server}
     */
    createServer(options) {
        const server = http.createServer(this.handle, options);

        server.on('upgrade', this.upgrade);

        return server;
    }

    /**
     * Creates a HTTPS server.
     *
     * @param {object} options
     * @return {https.Server}
     */
    createSecureServer(options) {
        const server = https.createServer(this.handle, options);

        server.on('upgrade', this.upgrade);

        return server;
    }

    /**
     * Handles a HTTP request.
     *
     * @param {http.IncomingRequest} req
     * @param {http.ServerResponse} res
     * @param {function} next
     */
    handle(req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'deny');
        res.setHeader('X-XSS-Protection', '1');
        res.setHeader('Feature-Policy', '');

        const {pathname} = url.parse(req.url);

        const accessory_ui_match = pathname.match(/^\/accessory-ui\/([0-9]+)(\/.*)?$/);

        if (accessory_ui_match) {
            const accessory_ui_id = accessory_ui_match[1];
            const accessory_ui_pathname = accessory_ui_match[2] || '/';

            req.url = accessory_ui_pathname;

            const accessory_ui = PluginManager.getAccessoryUI(accessory_ui_id);
            if (!accessory_ui) return res.end('Cannot ' + req.method + ' ' + pathname);

            accessory_ui.handle(req, res, next);
        } else if (pathname === '/websocket') {
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

    /**
     * Handles a HTTP upgrade.
     *
     * @param {http.IncomingRequest} request
     * @param {net.Socket} socket
     * @param {} head
     */
    upgrade(request, socket, head) {
        if (url.parse(request.url).pathname !== '/websocket') {
            socket.destroy();
        }

        this.wss.handleUpgrade(request, socket, head, ws => {
            this.wss.emit('connection', ws, request);
        });
    }

    handleWebsocketConnection(ws, req) {
        new Connection(this, ws, req);
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

            const connection = Connection.getConnectionForWebSocket(ws);
            if (except && except === connection || except instanceof Array && except.includes(connection)) continue;

            if (!connection.permissions.checkShouldReceiveBroadcast(data)) continue;

            ws.send(message);
        }
    }

    /**
     * Handle a characteristic update.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @param {Characteristic} characteristic
     * @param {} value
     * @param {} old_value
     * @param {object} context
     */
    handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context) {
        if (this.hasOwnProperty('automations')) {
            this.automations.handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context);
        }

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

    /**
     * Deletes all unused assets.
     *
     * @return {Promise<object>}
     */
    async cleanAssets() {
        const home_settings = await this.storage.getItem('Home');

        const layouts = await Promise.all((await this.storage.getItem('Layouts') || [])
            .map(uuid => this.storage.getItem('Layout.' + uuid)));
        const background_urls = [...new Set(layouts.map(l => l && l.background_url).filter(b => b))];

        const assets = await new Promise((rs, rj) =>
            fs.readdir(this.assets_path, (err, dir) => err ? rj(err) : rs(dir)));
        const unused_assets = assets.filter(a => !(home_settings && home_settings.background_url === a) &&
            !background_urls.includes(a));

        await Promise.all(unused_assets.map(asset => {
            return new Promise((rs, rj) => fs.unlink(path.join(this.assets_path, asset), err => err ? rj(err) : rs()));
        }));

        return {
            assets,
            deleted_assets: unused_assets,
        };
    }
}

Server.instances = new Set();

export class PluginAccessory {
    constructor(server, accessory, plugin, accessory_type, data) {
        this.server = server;
        this.accessory = accessory;
        this.plugin = plugin;
        this.accessory_type = accessory_type;
        this.data = data;
    }

    get uuid() {
        return this.accessory.UUID;
    }

    /**
     * Return an object that can be used to recreate this accessory.
     */
    cache() {
        return {
            accessory: {
                displayName: this.accessory.displayName,
                UUID: this.accessory.UUID,
                services: this.accessory.services.map(service => ({
                    displayName: service.displayName,
                    UUID: service.UUID,
                    subtype: service.subtype,
                    characteristics: service.characteristics.map(characteristic => ({
                        displayName: characteristic.displayName,
                        UUID: characteristic.UUID,
                        value: characteristic.value,
                        status: characteristic.status,
                        eventOnlyCharacteristic: characteristic.eventOnlyCharacteristic,
                        props: characteristic.props,
                    })),
                    optionalCharacteristics: service.optionalCharacteristics.map(characteristic => ({
                        displayName: characteristic.displayName,
                        UUID: characteristic.UUID,
                        value: characteristic.value,
                        status: characteristic.status,
                        eventOnlyCharacteristic: characteristic.eventOnlyCharacteristic,
                        props: characteristic.props,
                    })),
                })),
            },
            plugin: this.plugin.name,
            accessory_type: this.accessory_type,
            accessory_platform: this.accessory_platform,
            data: this.data,
        };
    }

    /**
     * Create an accessory from cached data.
     */
    static restore(server, cache) {
        const plugin = PluginManager.getPlugin(cache.plugin);
        const accessory = new Accessory(cache.accessory.displayName, cache.accessory.UUID);

        accessory.services = cache.accessory.services.map(service_cache => {
            const service = new Service(service_cache.displayName, service_cache.UUID, service_cache.subtype);

            service.characteristics = service_cache.characteristics.map(characteristic_cache => {
                const characteristic = new Characteristic(characteristic_cache.displayName, characteristic_cache.UUID, characteristic_cache.props);

                characteristic.value = characteristic_cache.value;
                characteristic.status = characteristic_cache.status;
                characteristic.eventOnlyCharacteristic = characteristic_cache.eventOnlyCharacteristic;

                return characteristic;
            });

            return service;
        });

        const plugin_accessory = cache.accessory_platform ?
            new PluginAccessoryPlatformAccessory(server, accessory, plugin, cache.accessory_platform) :
            new PluginAccessory(server, accessory, plugin, cache.accessory_type);

        return plugin_accessory;
    }
}

export class PluginAccessoryPlatformAccessory extends PluginAccessory {
    constructor(server, accessory, plugin, accessory_platform) {
        super(server, accessory, plugin);

        this.accessory_platform = accessory_platform;
    }
}
