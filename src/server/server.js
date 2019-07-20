import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import util from 'util';

import express from 'express';
import WebSocket from 'ws';
import persist from 'node-persist';
import csp from 'express-csp';
import cookieParser from 'cookie-parser';
import multer from 'multer';

import hap from 'hap-nodejs';

import isEqual from 'lodash.isequal';

import Events from '../events';
import {
    AddAccessoryEvent, RemoveAccessoryEvent, UpdateAccessoryConfigurationEvent,
    SceneActivateProgressEvent, SceneActivatedEvent, SceneDeactivateProgressEvent, SceneDeactivatedEvent,
    CharacteristicUpdateEvent,
} from '../events/server';

import Connection from './connection';
import PluginManager, {ServerPlugin} from './plugins';
import Bridge from './bridge';
import Homebridge from './homebridge';
import Logger from '../common/logger';
import {Accessory, Service, Characteristic} from 'hap-nodejs';

import {builtin_accessory_types, builtin_accessory_platforms} from '../accessories';
import {HAPIP as HAPIPDiscovery, HAPBLE as HAPBLEDiscovery} from '../accessory-discovery';

import Automations from '../automations';

import {events} from '..';

const DEVELOPMENT = true;

export default class Server extends Events {
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

        this.parent_emitter = events;

        Object.defineProperty(this, 'config', {enumerable: true, value: options.config || {}});
        Object.defineProperty(this, 'cli_auth_token', {value: options.cli_auth_token});
        Object.defineProperty(this, 'storage', {value: storage});
        Object.defineProperty(this, 'log', {value: log || new Logger()});

        Object.defineProperty(this, 'accessories', {value: []});
        Object.defineProperty(this, 'accessory_platforms', {value: []});
        Object.defineProperty(this, 'cached_accessories', {value: []});
        Object.defineProperty(this, 'bridges', {value: []});

        Object.defineProperty(this, 'homebridge', {writable: true});
        Object.defineProperty(this, 'config_automation_triggers', {writable: true});
        Object.defineProperty(this, 'config_automation_conditions', {writable: true});
        Object.defineProperty(this, 'config_automation_actions', {writable: true});

        Object.defineProperty(this, 'accessory_discovery_counter', {value: 0});
        Object.defineProperty(this, 'accessory_discovery_handlers', {value: new Set()});
        Object.defineProperty(this, 'accessory_discovery_handlers_events', {value: new WeakMap()});

        Object.defineProperty(this, 'app', {value: express()});

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

        Object.defineProperty(this, 'multer', {value: multer({dest: os.tmpdir()})});
        this.app.post('/assets/upload-layout-background', this.multer.single('background'),
            Connection.handleUploadLayoutBackground.bind(Connection, this));

        this.app.use((req, res, next) => {
            if (req.url.match(/^\/layout\/[^/]+$/) ||
                req.url.match(/^\/all-accessories$/) ||
                req.url.match(/^\/automations$/)) req.url = '/index.html';

            next();
        });

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

        Object.defineProperty(this, 'wss', {value: new WebSocket.Server({noServer: true})});
        this.wss.on('connection', (ws, req) => this.handleWebsocketConnection(ws, req));

        this.handle = this.handle.bind(this);
        this.upgrade = this.upgrade.bind(this);

        Object.defineProperty(this, 'characteristic_change_handlers', {value: new WeakMap()});
        Object.defineProperty(this, '_handleCharacteristicUpdate', {value: (default_accessory, event) => {
            // this.log.info('Updating characteristic', event);
            this.handleCharacteristicUpdate(event.accessory || default_accessory, event.service,
                event.characteristic, event.newValue, event.oldValue, event.context);
        }});

        Object.defineProperty(this, 'configuration_change_handlers', {value: new WeakMap()});
        Object.defineProperty(this, '_handleConfigurationChange', {value: (default_accessory, event) => {
            this.log.debug('Updating accessory configuration', event);
            this.handleConfigurationChange(event.accessory || default_accessory, event.service, event.characteristic);
        }});

        Object.defineProperty(this, '_handleRegisterHomebridgePlatformAccessories', {value: this.handleRegisterHomebridgePlatformAccessories.bind(this)});
        Object.defineProperty(this, '_handleUnregisterHomebridgePlatformAccessories', {value:
            this.handleUnregisterHomebridgePlatformAccessories.bind(this)});

        Server.instances.add(this);

        this.on(SceneActivateProgressEvent, event => this.sendBroadcast({
            type: 'scene-progress',
            uuid: event.scene.uuid,
            progress: event.progress,
        }));
        this.on(SceneActivatedEvent, event => this.sendBroadcast({
            type: 'scene-activated',
            uuid: event.scene.uuid,
        }));
        this.on(SceneDeactivateProgressEvent, event => this.sendBroadcast({
            type: 'scene-progress',
            uuid: event.scene.uuid,
            progress: event.progress,
        }));
        this.on(SceneDeactivatedEvent, event => this.sendBroadcast({
            type: 'scene-deactivated',
            uuid: event.scene.uuid,
        }));

        Object.defineProperty(this, 'plugins', {value: new Map()});
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

        const wrapConsoleFn = (fn, type) => (data, ...args) => {
            for (const server of Server.instances) {
                for (const ws of server.wss.clients) {
                    const connection = Connection.getConnectionForWebSocket(ws);
                    if (connection && connection.enable_proxy_stdout) {
                        ws.send('**:' + JSON.stringify({
                            type,
                            data: util.formatWithOptions ? util.formatWithOptions({
                                colors: true,
                            }, data, ...args) + '\n' : util.format(data, ...args) + '\n',
                        }));
                    }
                }
            }

            fn(data, ...args);
        };

        console.log = wrapConsoleFn(console_log, 'stdout');
        console.error = wrapConsoleFn(console_error, 'stderr');
    }

    async destroy() {
        throw new Error('Not implemented');

        this.destructor();
    }

    destructor() {
        // Server.instances.remove(this);
    }

    async loadPlugins() {
        for (const server_plugin of PluginManager.getServerPlugins()) {
            await this.loadPlugin(server_plugin);
        }
    }

    /**
     * Loads a server plugin.
     *
     * @param {function} server_plugin A class that extends ServerPlugin (and binds a plugin)
     * @param {object} [config]
     * @return {Promise}
     */
    async loadPlugin(server_plugin, config) {
        if (typeof server_plugin !== 'function' || !(server_plugin.prototype instanceof ServerPlugin)) {
            throw new Error('server_plugin must be a class that extends ServerPlugin');
        }

        if (this.plugins.has(server_plugin.id)) {
            throw new Error('Already have a server plugin with the ID "' + server_plugin.id + '"');
        }

        const instance = new server_plugin(this, config); // eslint-disable-line new-cap

        this.plugins.set(server_plugin.id, instance);

        await instance.load();
    }

    /**
     * Gets a server plugin instance.
     *
     * @param {(function|number)} id A class that extends ServerPlugin or an ID
     * @return {ServerPlugin}
     */
    getPlugin(id) {
        if (typeof id === 'function' || typeof id === 'object') id = id.id;

        return this.plugins.get(id);
    }

    loadBridgesFromConfig() {
        if (!this.config.bridges) return Promise.resolve();

        return Promise.all(this.config.bridges.map(bridge_config => this.loadBridge(bridge_config)));
    }

    async loadBridgesFromStorage(dont_throw) {
        const bridge_uuids = await this.storage.getItem('Bridges') || [];

        return Promise.all(bridge_uuids.map(async uuid => {
            try {
                const data = await this.storage.getItem('Bridge.' + uuid) || {};
                return this.loadBridge(data, uuid);
            } catch (err) {
                if (!dont_throw && typeof dont_throw !== 'undefined') throw err;

                this.log.warn('Error loading bridge', cache.plugin, cache.accessory.displayName, err);
            }
        }));
    }

    /**
     * Loads a bridge.
     *
     * @param {object} bridge_config
     * @param {string} bridge_config.username
     * @param {string} [bridge_config.uuid]
     * @param {string} [bridge_config.name]
     * @param {number} [bridge_config.port]
     * @param {string} [bridge_config.pincode]
     * @param {boolean} [bridge_config.unauthenticated_access]
     * @param {(Array|string)[]} [bridge_config.accessories]
     * @param {string} [uuid]
     * @return {Bridge}
     */
    loadBridge(bridge_config, uuid) {
        // bridge_config.username is required - all other properties are optional
        const name = bridge_config.name || 'Bridge ' + bridge_config.username.match(/(.{2}\:.{2})$/)[1];

        const bridge = new Bridge(this, this.log.withPrefix(name), {
            uuid: uuid || bridge_config.uuid || hap.uuid.generate('hap-server:bridge:' + bridge_config.username),
            name,
            username: bridge_config.username,
            port: bridge_config.port,
            pincode: bridge_config.pincode,
            unauthenticated_access: bridge_config.unauthenticated_access,

            accessory_uuids: bridge_config.accessories,
            config: bridge_config,
        });

        if (this.bridges.find(b => b.uuid === bridge.uuid)) {
            throw new Error('There is already a bridge with the UUID "' + bridge.uuid + '"');
        }

        this.bridges.push(bridge);

        for (const accessory_uuid of bridge.accessory_uuids) {
            if (accessory_uuid instanceof Array) {
                const accessory = this.accessories.find(accessory =>
                    accessory_uuid[0] === accessory.plugin ? accessory.plugin.name : null &&
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (accessory) bridge.addAccessory(accessory.accessory);

                const cached_accessory = this.cached_accessories.find(accessory =>
                    accessory_uuid[0] === accessory.plugin ? accessory.plugin.name : null &&
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (cached_accessory) bridge.addCachedAccessory(cached_accessory.accessory);
            } else {
                const accessory = this.accessories.find(accessory => accessory.uuid === accessory_uuid);
                if (accessory) bridge.addAccessory(accessory.accessory);

                const cached_accessory = this.cached_accessories.find(accessory => accessory.uuid === accessory_uuid);
                if (cached_accessory) bridge.addCachedAccessory(cached_accessory.accessory);
            }
        }

        return bridge;
    }

    /**
     * Removes a bridge.
     *
     * @param {(Bridge|string)} bridge
     */
    async unloadBridge(bridge) {
        if (!(bridge instanceof Bridge)) {
            bridge = this.bridges.find(b => b.uuid === bridge);
        }

        if (bridge instanceof Homebridge) {
            throw new Error('Homebridge cannot be unloaded');
        }

        await bridge.unpublish();

        let index;
        while ((index = this.bridges.findIndex(b => b.uuid === bridge.uuid)) !== -1) {
            this.bridges.splice(index, 1);
        }
    }

    loadHomebridge() {
        if (this.homebridge) return this.homebridge;

        // config.bridge, config.accessories and config.platforms are for Homebridge
        // If any of these exist, the user wants to run Homebridge as well
        this.homebridge = new Homebridge(this, this.log.withPrefix('Homebridge'), {
            bridge: this.config.bridge,
            accessories: this.config.accessories,
            platforms: this.config.platforms,
        });

        this.bridges.push(this.homebridge);

        return this.homebridge;
    }

    async loadHomebridgeAccessories() {
        for (const accessory of this.homebridge.bridge.bridgedAccessories) {
            const plugin_accessory = new HomebridgeAccessory(this, accessory);

            this.addAccessory(plugin_accessory);
        }

        this.homebridge.homebridge._api
            .on('handleRegisterPlatformAccessories', this._handleRegisterHomebridgePlatformAccessories);
        this.homebridge.homebridge._api
            .on('handleUnregisterPlatformAccessories', this._handleUnregisterHomebridgePlatformAccessories);
    }

    handleRegisterHomebridgePlatformAccessories(accessories) {
        for (const platform_accessory of accessories) {
            const accessory = platform_accessory._associatedHAPAccessory;
            if (!accessory) continue;

            const plugin_accessory = new HomebridgeAccessory(this, accessory, platform_accessory);

            this.addAccessory(plugin_accessory);
        }
    }

    handleUnregisterHomebridgePlatformAccessories(accessories) {
        for (const platform_accessory of accessories) {
            const accessory = platform_accessory._associatedHAPAccessory;
            if (!accessory) continue;

            const plugin_accessory = this.accessories.find(a => a instanceof HomebridgeAccessory &&
                (a.platform_accessory === platform_accessory || a.uuid === accessory.UUID));

            this.removeAccessory(plugin_accessory);
        }
    }

    async loadCachedAccessories(dont_throw) {
        const cached_accessories = await this.storage.getItem('CachedAccessories') || [];

        await Promise.all(cached_accessories.map(cache => this.loadCachedAccessory(cache).catch(err => {
            if (!dont_throw && typeof dont_throw !== 'undefined') throw err;

            this.log.warn('Error restoring cached accessory', cache.plugin, cache.accessory.displayName, err);
        })));
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

    /**
     * Gets a cached accessory.
     *
     * @param {string} uuid
     * @param {Plugin} [plugin]
     * @param {string} [accessory_type]
     * @return {PluginStandaloneAccessory}
     */
    getCachedAccessory(uuid, plugin, accessory_type) {
        return this.cached_accessories.find(accessory => accessory.uuid === uuid &&
            (!plugin || accessory.plugin === plugin) &&
            accessory instanceof PluginStandaloneAccessory &&
            ((!plugin && !accessory_type) || accessory.accessory_type === accessory_type));
    }

    /**
     * Gets an accessory platform's cached accessories.
     *
     * @param {string} base_uuid
     * @param {Plugin} plugin
     * @param {string} accessory_platform_name
     * @return {PluginAccessoryPlatformAccessory[]}
     */
    getCachedAccessoryPlatformAccessories(base_uuid, plugin, accessory_platform_name) {
        return this.cached_accessories.filter(accessory => accessory.base_uuid === base_uuid &&
            accessory.plugin === plugin &&
            accessory instanceof PluginAccessoryPlatformAccessory &&
            accessory.accessory_platform_name === accessory_platform_name);
    }

    /**
     * Removes a cached accessory.
     *
     * @param {string} uuid
     */
    removeCachedAccessory(uuid) {
        let index;
        while ((index = this.cached_accessories.findIndex(accessory => accessory.uuid === uuid)) !== -1) {
            this.cached_accessories.splice(index, 1);
        }
    }

    /**
     * Saves data from all accessories to cache.
     *
     * @return {Promise}
     */
    async saveCachedAccessories() {
        const cached_accessories = await Promise.all(this.accessories.concat(this.cached_accessories)
            .map(accessory => accessory.cache()));

        await this.storage.setItem('CachedAccessories', cached_accessories);
    }

    /**
     * Adds a accessory.
     *
     * @param {PluginAccessory} plugin_accessory
     */
    addAccessory(plugin_accessory) {
        // eslint-disable-next-line curly
        if (this.accessories.find(a => a.uuid === plugin_accessory.uuid)) throw new Error('Already have an' +
            ' accessory with the UUID "' + plugin_accessory.uuid + '"');

        plugin_accessory.accessory.bridges = true;

        const prev_characteristic_change_handler = this.characteristic_change_handlers.get(plugin_accessory.accessory);
        if (prev_characteristic_change_handler) {
            plugin_accessory.accessory.removeListener('service-characteristic-change', prev_characteristic_change_handler);
        }
        const characteristic_change_handler = this._handleCharacteristicUpdate.bind(this.server, plugin_accessory.accessory);
        this.characteristic_change_handlers.set(plugin_accessory.accessory, characteristic_change_handler);
        plugin_accessory.accessory.on('service-characteristic-change', characteristic_change_handler);

        const prev_configuration_change_handler = this.configuration_change_handlers.get(plugin_accessory.accessory);
        if (prev_configuration_change_handler) {
            plugin_accessory.accessory.removeListener('service-configurationChange', prev_configuration_change_handler);
        }
        const configuration_change_handler = this._handleConfigurationChange.bind(this.server, plugin_accessory.accessory);
        this.configuration_change_handlers.set(plugin_accessory.accessory, configuration_change_handler);
        plugin_accessory.accessory.on('service-configurationChange', configuration_change_handler);

        this.removeCachedAccessory(plugin_accessory.uuid);

        this.accessories.push(plugin_accessory);

        for (const bridge of this.bridges.filter(bridge => bridge.accessory_uuids.find(accessory_uuid =>
            accessory_uuid instanceof Array ? accessory_uuid[0] === (plugin_accessory.plugin ?
                plugin_accessory.plugin.name : plugin_accessory instanceof HomebridgeAccessory ?
                    'homebridge' : null) &&
                accessory_uuid[1] === (plugin_accessory instanceof PluginStandaloneAccessory ?
                    plugin_accessory.accessory_type : plugin_accessory instanceof PluginAccessoryPlatformAccessory ?
                        plugin_accessory.accessory_platform : null) &&
                accessory_uuid[2] === plugin_accessory.accessory.displayName :
                accessory_uuid === plugin_accessory.uuid
        ))) {
            bridge.addAccessory(plugin_accessory.accessory);
        }

        this.emit(AddAccessoryEvent, this, plugin_accessory);
    }

    /**
     * Removes an accessory.
     *
     * @param {PluginAccessory} plugin_accessory
     */
    removeAccessory(plugin_accessory) {
        const characteristic_change_handler = this.characteristic_change_handlers.get(plugin_accessory.accessory);
        if (characteristic_change_handler) {
            plugin_accessory.accessory.removeListener('service-characteristic-change',
                this.server.__handleCharacteristicUpdate);
        }
        const configuration_change_handler = this.configuration_change_handlers.get(plugin_accessory.accessory);
        if (configuration_change_handler) {
            plugin_accessory.accessory.removeListener('service-configurationChange', configuration_change_handler);
        }

        let index;
        while ((index = this.accessories.findIndex(a => a.uuid === plugin_accessory.uuid)) !== -1) {
            this.accessories.splice(index, 1);
        }

        for (const bridge of this.bridges) {
            if (!bridge.bridge.bridgedAccessories.find(a => a.UUID === plugin_accessory.uuid)) continue;

            bridge.removeAccessory(plugin_accessory.accessory);
        }

        this.emit(RemoveAccessoryEvent, this, plugin_accessory);
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
        if (!accessory_type || !name) throw new Error('Invalid accessory configuration: accessories must have the' +
            ' plugin, accessory and name properties');

        const is_builtin = !plugin_name && builtin_accessory_types[accessory_type];

        const plugin = is_builtin ? null : PluginManager.getPlugin(plugin_name);
        if (!plugin && !is_builtin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const accessory_handler = is_builtin ? builtin_accessory_types[accessory_type] :
            plugin.getAccessoryHandler(accessory_type);
        if (!accessory_handler) throw new Error('No accessory handler with the name "' + accessory_type + '"');

        // eslint-disable-next-line curly
        if (!accessory_config.uuid) accessory_config.uuid = hap.uuid.generate('accessory:' + plugin_name + ':' +
            accessory_type + ':' + name);

        const cached_accessory = this.getCachedAccessory(accessory_config.uuid);

        const accessory = await accessory_handler.call(plugin, accessory_config,
            cached_accessory ? cached_accessory.accessory : undefined);

        const plugin_accessory = new PluginStandaloneAccessory(this, accessory, plugin, accessory_type,
            accessory_config, accessory_config.uuid);

        this.addAccessory(plugin_accessory);
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

    /**
     * Loads an accessory platform.
     *
     * @param {object} config
     * @return {Promise}
     */
    async loadAccessoryPlatform(config) {
        const {plugin: plugin_name, platform: accessory_platform_name, name} = config;

        // eslint-disable-next-line curly
        if (!accessory_platform_name || !name) throw new Error('Invalid accessory platform configuration: accessory' +
            ' platforms must have the plugin, platform and name properties');

        const is_builtin = !plugin_name && builtin_accessory_platforms[accessory_platform_name];

        const plugin = is_builtin ? null : PluginManager.getPlugin(plugin_name);
        if (!plugin && !is_builtin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const AccessoryPlatformHandler = is_builtin ? builtin_accessory_platforms[accessory_platform_name] :
            plugin.getAccessoryPlatformHandler(accessory_platform_name);
        if (!AccessoryPlatformHandler) throw new Error('No accessory platform handler with the name "' + // eslint-disable-line curly
            accessory_platform_name + '"');

        if (!config.uuid) config.uuid = 'accessoryplatform:' + plugin_name + ':' + accessory_platform_name + ':' + name;

        // eslint-disable-next-line curly
        if (this.accessory_platforms.find(p => p.config.uuid === config.uuid)) throw new Error('Already have an' +
            ' accessory platform with the UUID base "' + accessory.config.uuid + '"');

        const cached_accessories = this.getCachedAccessoryPlatformAccessories(config.uuid, plugin,
            accessory_platform_name).map(plugin_accessory => plugin_accessory.accessory);

        const accessory_platform = new AccessoryPlatformHandler(plugin, this, config, cached_accessories);
        await accessory_platform.init(cached_accessories);

        this.accessory_platforms.push(accessory_platform);

        return accessory_platform;
    }

    get automations() {
        return Object.defineProperty(this, 'automations', {value: new Automations(this)}).automations;
    }

    async loadAutomationTriggersFromConfig(dont_throw) {
        if (this.config_automation_triggers) return this.config_automation_triggers;
        const triggers = {};

        await Promise.all(Object.entries(this.config['automation-triggers'] || {}).map(([key, config]) =>
            this.automations.loadAutomationTrigger(config).then(t => triggers[key] = t).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation trigger', config.plugin, config.trigger, err);
            })));

        return this.config_automation_triggers = triggers;
    }

    async loadAutomationConditionsFromConfig(dont_throw) {
        if (this.config_automation_conditions) return this.config_automation_conditions;
        const conditions = {};

        await Promise.all(Object.entries(this.config['automation-conditions'] || {}).map(([key, config]) =>
            this.automations.loadAutomationCondition(config).then(t => conditions[key] = t).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation condition', config.plugin, config.condition, err);
            })));

        return this.config_automation_conditions = conditions;
    }

    async loadAutomationActionsFromConfig(dont_throw) {
        if (this.config_automation_actions) return this.config_automation_actions;
        const actions = {};

        await Promise.all(Object.entries(this.config['automation-actions'] || {}).map(([key, config]) =>
            this.automations.loadAutomationAction(config).then(t => actions[key] = t).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation action', config.plugin, config.action, err);
            })));

        return this.config_automation_actions = actions;
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

    async loadAutomationsFromStorage(dont_throw) {
        const automation_uuids = await this.storage.getItem('Automations') || [];

        return Promise.all(automation_uuids.map(async uuid => {
            const data = await this.storage.getItem('Automation.' + uuid) || {};
            return this.loadAutomation(uuid, data);
        }));
    }

    /**
     * Loads or reloads an automation.
     *
     * @param {string} uuid
     * @param {object} data
     * @return {Promise<(Automation|object)>}
     */
    loadOrUpdateAutomation(uuid, data) {
        if (this.automations.automations.find(automation => automation.uuid === uuid)) {
            return this.updateAutomation(uuid, data);
        }

        return this.loadAutomation(uuid, data);
    }

    /**
     * Loads an automation.
     *
     * @param {string} uuid
     * @param {object} data
     * @return {Promise<Automation>}
     */
    async loadAutomation(uuid, data) {
        const automation = await this.automations.loadAutomation(data, uuid);

        for (const [trigger_id, trigger_config] of Object.entries(data.triggers || {})) {
            const trigger = await this.automations.loadAutomationTrigger(trigger_config, trigger_id);
            await automation.addTrigger(trigger);
        }

        for (const [condition_id, condition_config] of Object.entries(data.conditions || {})) {
            const condition = await this.automations.loadAutomationCondition(condition_config, condition_id);
            automation.addCondition(condition);
        }

        for (const [action_id, action_config] of Object.entries(data.actions || {})) {
            const action = await this.automations.loadAutomationAction(action_config, action_id);
            await automation.addAction(action);
        }

        return automation;
    }

    /**
     * Reloads an automation.
     *
     * @param {string} uuid
     * @param {object} data
     * @return {Promise<(Automation|object)>}
     */
    async updateAutomation(uuid, data) {
        const automation = this.automations.automations.find(automation => automation.uuid === uuid);
        if (!automation) throw new Error('Unknown automation "' + uuid + '"');

        const nullchildren = {triggers: undefined, conditions: undefined, actions: undefined};

        if (!isEqual(
            Object.assign({}, nullchildren, data, nullchildren),
            Object.assign({}, nullchildren, automation.config, nullchildren)
        )) {
            // Top level configuration has changed
            // This isn't actually used for anything yet
            const automation = this.automations.automations.find(automation => automation.uuid === uuid);
            await this.automations.removeAutomation(automation);
            return this.loadAutomation(uuid, data);
        }

        const added_triggers = [];
        const removed_triggers = [];

        for (const [trigger_id, trigger_config] of Object.entries(data.triggers || {})) {
            const trigger = automation.triggers.find(trigger => trigger.uuid === trigger_id);
            if (trigger && isEqual(trigger_config, trigger.config)) continue;

            if (trigger) {
                // Trigger configuration has changed
                await automation.removeTrigger(trigger);
                removed_triggers.push(trigger);
            }

            const new_trigger = await this.automations.loadAutomationTrigger(trigger_config, trigger_id);
            await automation.addTrigger(new_trigger);
            added_triggers.push(new_trigger);
        }

        for (const trigger of automation.triggers) {
            if ((data.triggers || {})[trigger.uuid]) continue;

            // Trigger has been removed
            await automation.removeTrigger(trigger);
            removed_triggers.push(trigger);
        }

        const added_conditions = [];
        const removed_conditions = [];

        for (const [condition_id, condition_config] of Object.entries(data.conditions || {})) {
            const condition = automation.conditions.find(condition => condition.uuid === condition_id);
            if (condition && isEqual(condition_config, condition.config)) continue;

            if (condition) {
                // Condition configuration has changed
                await automation.removeCondition(condition);
                removed_conditions.push(condition);
            }

            const new_condition = await this.automations.loadAutomationCondition(condition_config, condition_id);
            automation.addCondition(new_condition);
            added_conditions.push(new_condition);
        }

        for (const condition of automation.conditions) {
            if ((data.conditions || {})[condition.uuid]) continue;

            // Condition has been removed
            await automation.removeCondition(condition);
            removed_conditions.push(condition);
        }

        const added_actions = [];
        const removed_actions = [];

        for (const [action_id, action_config] of Object.entries(data.actions || {})) {
            const action = automation.actions.find(action => action.uuid === action_id);
            if (action && isEqual(action_config, action.config)) continue;

            if (action) {
                // Action configuration has changed
                await automation.removeAction(action);
                removed_actions.push(action);
            }

            const new_action = await this.automations.loadAutomationAction(action_config, action_id);
            await automation.addAction(new_action);
            added_actions.push(new_action);
        }

        for (const action of automation.actions) {
            if ((data.actions || {})[action.uuid]) continue;

            // Action has been removed
            await automation.removeAction(action);
            removed_actions.push(action);
        }

        return {added_triggers, removed_triggers, added_conditions, removed_conditions, added_actions, removed_actions};
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

    async loadScenesFromStorage(dont_throw) {
        const scene_uuids = await this.storage.getItem('Scenes') || [];

        return Promise.all(scene_uuids.map(async uuid => {
            const data = await this.storage.getItem('Scene.' + uuid) || {};
            return this.loadScene(uuid, data);
        }));
    }

    /**
     * Loads or reloads a scene.
     *
     * @param {string} uuid
     * @param {object} data
     * @return {Promise<(Scene|object)>}
     */
    loadOrUpdateScene(uuid, data) {
        if (this.automations.scenes.find(scene => scene.uuid === uuid)) {
            return this.updateScene(uuid, data);
        }

        return this.loadScene(uuid, data);
    }

    /**
     * Loads a scene.
     *
     * @param {string} uuid
     * @param {object} data
     * @return {Promise<Scene>}
     */
    async loadScene(uuid, data) {
        const scene = await this.automations.loadScene(data, uuid);

        for (const [condition_id, condition_config] of Object.entries(data.conditions || {})) {
            const condition = await this.automations.loadAutomationCondition(condition_config, condition_id);
            scene.addActiveCondition(condition);
        }

        for (const [action_id, action_config] of Object.entries(data.enable_actions || {})) {
            const action = await this.automations.loadAutomationAction(action_config, action_id);
            await scene.addEnableAction(action);
        }

        for (const [action_id, action_config] of Object.entries(data.disable_actions || {})) {
            const action = await this.automations.loadAutomationAction(action_config, action_id);
            await scene.addDisableAction(action);
        }

        return scene;
    }

    /**
     * Reloads a scene.
     *
     * @param {string} uuid
     * @param {object} data
     * @return {Promise<(Scene|object)>}
     */
    async updateScene(uuid, data) {
        const scene = this.automations.scenes.find(scene => scene.uuid === uuid);
        if (!scene) throw new Error('Unknown scene "' + uuid + '"');

        const nullchildren = {conditions: undefined, enable_actions: undefined, disable_actions: undefined};

        if (!isEqual(
            Object.assign({}, nullchildren, data, nullchildren),
            Object.assign({}, nullchildren, scene.config, nullchildren)
        )) {
            // Top level configuration has changed
            // This isn't actually used for anything yet
            const scene = this.automations.scenes.find(scene => scene.uuid === uuid);
            await this.automations.removeScene(scene);
            return this.loadScene(uuid, data);
        }

        const added_conditions = [];
        const removed_conditions = [];

        for (const [condition_id, condition_config] of Object.entries(data.conditions || {})) {
            const condition = scene.conditions.find(condition => condition.uuid === condition_id);
            if (condition && isEqual(condition_config, condition.config)) continue;

            if (condition) {
                // Condition configuration has changed
                await scene.removeActiveCondition(condition);
                removed_conditions.push(condition);
            }

            const new_condition = await this.automations.loadAutomationCondition(condition_config, condition_id);
            scene.addActiveCondition(new_condition);
            added_conditions.push(new_condition);
        }

        for (const condition of scene.conditions) {
            if ((data.conditions || {})[condition.uuid]) continue;

            // Condition has been removed
            await scene.removeActiveCondition(condition);
            removed_conditions.push(condition);
        }

        const added_enable_actions = [];
        const removed_enable_actions = [];

        for (const [action_id, action_config] of Object.entries(data.enable_actions || {})) {
            const action = scene.enable_actions.find(action => action.uuid === action_id);
            if (action && isEqual(action_config, action.config)) continue;

            if (action) {
                // Action configuration has changed
                await scene.removeEnableAction(action);
                removed_enable_actions.push(action);
            }

            const new_action = await this.automations.loadAutomationAction(action_config, action_id);
            await scene.addEnableAction(new_action);
            added_enable_actions.push(new_action);
        }

        for (const action of scene.enable_actions) {
            if ((data.enable_actions || {})[action.uuid]) continue;

            // Action has been removed
            await scene.removeEnableAction(action);
            removed_enable_actions.push(action);
        }

        const added_disable_actions = [];
        const removed_disable_actions = [];

        for (const [action_id, action_config] of Object.entries(data.disable_actions || {})) {
            const action = scene.disable_actions.find(action => action.uuid === action_id);
            if (action && isEqual(action_config, action.config)) continue;

            if (action) {
                // Action configuration has changed
                await scene.removeDisableAction(action);
                removed_disable_actions.push(action);
            }

            const new_action = await this.automations.loadAutomationAction(action_config, action_id);
            await scene.addDisableAction(new_action);
            added_enable_actions.push(new_action);
        }

        for (const action of scene.disable_actions) {
            if ((data.disable_actions || {})[action.uuid]) continue;

            // Action has been removed
            await scene.removeDisableAction(action);
            removed_disable_actions.push(action);
        }

        return {
            added_conditions, removed_conditions, added_enable_actions, removed_enable_actions,
            added_disable_actions, removed_disable_actions,
        };
    }

    /**
     * Starts accessory discovery.
     */
    async startAccessoryDiscovery() {
        await Promise.all([
            HAPIPDiscovery, HAPBLEDiscovery,
            ...PluginManager.getAccessoryDiscoveryHandlers(),
        ].map(async accessory_discovery => {
            if (this.accessory_discovery_handlers.has(accessory_discovery)) return;

            this.log.debug('Starting accessory discovery handler', accessory_discovery.id);

            this.accessory_discovery_handlers.add(accessory_discovery);

            let events = this.accessory_discovery_handlers_events.get(accessory_discovery);
            if (!events) this.accessory_discovery_handlers_events.set(accessory_discovery, events = {});

            if (!events.add_accessory) events.add_accessory = data => // eslint-disable-line curly
                this.handleAddDiscoveredAccessory(accessory_discovery, data);
            accessory_discovery.on('add-accessory', events.add_accessory);
            if (!events.remove_accessory) events.remove_accessory = data => // eslint-disable-line curly
                this.handleRemoveDiscoveredAccessory(accessory_discovery, data);
            accessory_discovery.on('remove-accessory', events.remove_accessory);

            await accessory_discovery.start();
        }));
    }

    /**
     * Stops accessory discovery.
     */
    async stopAccessoryDiscovery() {
        await Promise.all([
            HAPIPDiscovery, HAPBLEDiscovery,
            ...PluginManager.getAccessoryDiscoveryHandlers(),
        ].map(async accessory_discovery => {
            if (!this.accessory_discovery_handlers.has(accessory_discovery)) return;

            this.log.debug('Stopping accessory discovery handler', accessory_discovery.id);

            this.accessory_discovery_handlers.delete(accessory_discovery);

            let events = this.accessory_discovery_handlers_events.get(accessory_discovery);
            if (!events) this.accessory_discovery_handlers_events.set(accessory_discovery, events = {});

            accessory_discovery.removeListener('add-accessory', events.add_accessory);
            accessory_discovery.removeListener('remove-accessory', events.remove_accessory);

            await accessory_discovery.stop();
        }));
    }

    /**
     * Starts accessory discovery if it isn't already running and increment the listening counter.
     */
    incrementAccessoryDiscoveryCounter() {
        if (!this.accessory_discovery_counter) this.startAccessoryDiscovery();

        this.accessory_discovery_counter++;

        this.log.debug('Accessory discovery counter: %d', this.accessory_discovery_counter);
    }

    /**
     * Decrement the listening counter and stop accessory discovery if there are no listeners left.
     */
    decrementAccessoryDiscoveryCounter() {
        this.accessory_discovery_counter--;

        this.log.debug('Accessory discovery counter: %d', this.accessory_discovery_counter);

        if (!this.accessory_discovery_counter) this.stopAccessoryDiscovery();
    }

    /**
     * Gets all already discovered accessories.
     *
     * @return {DiscoveredAccessory[]}
     */
    getDiscoveredAccessories() {
        const discovered_accessories = [];

        for (const accessory_discovery of this.accessory_discovery_handlers) {
            discovered_accessories.push(...accessory_discovery.discovered_accessories);
        }

        return discovered_accessories;
    }

    /**
     * Called when new accessories are discovered.
     *
     * @param {AccessoryDiscovery} accessory_discovery
     * @param {DiscoveredAccessory} discovered_accessory
     */
    handleAddDiscoveredAccessory(accessory_discovery, discovered_accessory) {
        for (const ws of this.wss.clients) {
            const connection = Connection.getConnectionForWebSocket(ws);
            if (connection && connection.enable_accessory_discovery) {
                ws.send('**:' + JSON.stringify({
                    type: 'add-discovered-accessory',
                    plugin: accessory_discovery.plugin ? accessory_discovery.plugin.name : null,
                    accessory_discovery: accessory_discovery.id,
                    id: discovered_accessory.id,
                    data: discovered_accessory,
                }));
            }
        }
    }

    /**
     * Called when discovered accessories are removed.
     *
     * @param {AccessoryDiscovery} accessory_discovery
     * @param {DiscoveredAccessory} discovered_accessory
     */
    handleRemoveDiscoveredAccessory(accessory_discovery, discovered_accessory) {
        for (const ws of this.wss.clients) {
            const connection = Connection.getConnectionForWebSocket(ws);
            if (connection && connection.enable_accessory_discovery) {
                ws.send('**:' + JSON.stringify({
                    type: 'remove-discovered-accessory',
                    plugin: accessory_discovery.plugin ? accessory_discovery.plugin.name : null,
                    accessory_discovery: accessory_discovery.id,
                    id: discovered_accessory.id,
                }));
            }
        }
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
        if (!characteristic_uuid) {
            characteristic_uuid = service_uuid.substr(service_uuid.lastIndexOf('.') + 1);
            service_uuid = service_uuid.substr(0, service_uuid.lastIndexOf('.'));
        }

        const service = this.getService(accessory_uuid, service_uuid);
        if (!service) return;

        return service.characteristics.find(c => c.UUID === characteristic_uuid);
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
        const server = https.createServer(options, this.handle);

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
            if (!accessory_ui) {
                res.end('Cannot ' + req.method + ' ' + pathname);
                return;
            }

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
     * @param {*} head
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
     * @param {*} data
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
     * @param {*} value
     * @param {*} old_value
     * @param {object} context
     * @return {Promise}
     */
    async handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context) {
        this.emit(CharacteristicUpdateEvent, this, accessory, service, characteristic, value, old_value, context);

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

        for (const bridge of this.bridges) {
            if (bridge instanceof Homebridge || !bridge.hasOwnProperty('hap_server')) continue;

            if (!bridge.bridge.bridgedAccessories.includes(accessory)) continue;

            const aid = bridge.hap_server.getAccessoryID(accessory);
            const iid = bridge.hap_server.getCharacteristicID(accessory, service, characteristic);

            bridge.hap_server.server.notifyClients(/* eventName */ `${aid}.${iid}`, /* data */ {
                characteristics: [{aid, iid, value}],
            }, /* excludeEvents */ context);
        }
    }

    /**
     * Handle an accessory configuration change.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @param {Characteristic} characteristic
     */
    handleConfigurationChange(accessory, service, characteristic) {
        this.emit(UpdateAccessoryConfigurationEvent, this, accessory, service, characteristic);

        // ...
    }

    /**
     * Handle changes to a HAP server's pairings.
     *
     * @param {Bridge} bridge
     */
    handlePairingsUpdate(bridge) {
        this.sendBroadcast({
            type: 'update-pairings',
            bridge_uuid: bridge.uuid,
            // pairings: ...,
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
Server.patchStdout();

export class PluginAccessory {
    constructor(server, accessory, plugin, data) {
        Object.defineProperty(this, 'server', {value: server});
        Object.defineProperty(this, 'accessory', {value: accessory});
        Object.defineProperty(this, 'plugin', {value: plugin});
        this.data = data;

        Object.defineProperty(this.accessory, 'plugin_accessory', {value: this});
    }

    get uuid() {
        return this.accessory.UUID;
    }

    destroy() {
        if (this.accessory.listenerCount('destroy') <= 0) {
            this.server.log.warn('Accessory %s doesn\'t have a destory handler', this.uuid);
        }

        this.accessory.emit('destroy');
    }

    /**
     * Return an object that can be used to recreate this accessory.
     *
     * @return {object}
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
                external_groups: this instanceof HomebridgeAccessory ? undefined : this.accessory.external_groups,
            },
            plugin: this.plugin ? this.plugin.name : null,
            uuid: this.uuid,
            is_homebridge: this instanceof HomebridgeAccessory,
            accessory_type: this.accessory_type,
            base_uuid: this.base_uuid,
            accessory_platform: this.accessory_platform_name,
            data: this.data,
            bridge_uuids: this.server.bridges.filter(b => b.accessory_uuids.includes(this.accessory.UUID)).map(b => b.uuid),
            bridge_uuids_external: this.server.bridges.filter(b => b.accessory_uuids.includes(this.accessory.UUID) &&
                b.external_accessories.find(a => a.UUID === this.accessory.UUID)).map(b => b.uuid),
        };
    }

    /**
     * Create an accessory from cached data.
     *
     * @param {Server} server
     * @param {object} cache The cached data returned from pluginaccessory.cache
     * @return {PluginAccessory}
     */
    static restore(server, cache) {
        const accessory = new Accessory(cache.accessory.displayName, cache.accessory.UUID);

        accessory.services = cache.accessory.services.map(service_cache => {
            const service = new Service(service_cache.displayName, service_cache.UUID, service_cache.subtype);

            service.characteristics = service_cache.characteristics.map(characteristic_cache => {
                const characteristic = new Characteristic(characteristic_cache.displayName, characteristic_cache.UUID,
                    characteristic_cache.props);

                characteristic.value = characteristic_cache.value;
                characteristic.status = characteristic_cache.status;
                characteristic.eventOnlyCharacteristic = characteristic_cache.eventOnlyCharacteristic;

                return characteristic;
            });

            return service;
        });

        if (cache.is_homebridge) {
            const plugin_accessory = new HomebridgeAccessory(server, accessory);
            plugin_accessory.cached_data = cache;
            return plugin_accessory;
        }

        accessory.external_groups = cache.accessory.external_groups;

        const is_builtin = !cache.plugin && (builtin_accessory_types[cache.accessory_type] ||
            builtin_accessory_platforms[cache.accessory_platform]);

        const plugin = is_builtin ? null : PluginManager.getPlugin(cache.plugin);
        if (!plugin && !is_builtin) throw new Error('Unknown plugin "' + cache.plugin + '"');

        const accessory_handler = cache.accessory_type ? is_builtin ? builtin_accessory_types[cache.accessory_type] :
            plugin.getAccessoryHandler(cache.accessory_type) : undefined;
        if (cache.accessory_type && !accessory_handler) throw new Error('Unknown accessory "' + // eslint-disable-line curly
            cache.accessory_type + '"');

        const accessory_platform_handler = cache.accessory_platform ? is_builtin ?
            builtin_accessory_platforms[cache.accessory_platform] :
            plugin.getAccessoryPlatformHandler(cache.accessory_platform) : undefined;
        if (cache.accessory_platform && !accessory_platform_handler) throw new Error('Unknown accessory platform "' + // eslint-disable-line curly
            cache.accessory_platform + '"');

        if (!accessory_handler && !accessory_platform_handler) throw new Error('Invalid cache data');

        const plugin_accessory = accessory_platform_handler ?
            new PluginAccessoryPlatformAccessory(server, accessory, plugin, cache.accessory_platform, cache.base_uuid) :
            new PluginStandaloneAccessory(server, accessory, plugin, cache.accessory_type, null, cache.uuid);

        plugin_accessory.cached_data = cache;

        return plugin_accessory;
    }
}

export class PluginStandaloneAccessory extends PluginAccessory {
    constructor(server, accessory, plugin, accessory_type, config, uuid) {
        super(server, accessory, plugin);

        Object.defineProperty(this, 'config', {value: config});
        Object.defineProperty(this, 'uuid', {value: uuid || accessory.UUID});
        Object.defineProperty(this, 'accessory_type', {value: accessory_type});
    }
}

export class PluginAccessoryPlatformAccessory extends PluginAccessory {
    constructor(server, accessory, plugin, accessory_platform_name, base_uuid) {
        super(server, accessory, plugin);

        Object.defineProperty(this, 'base_uuid', {value: base_uuid});
        Object.defineProperty(this, 'accessory_platform_name', {value: accessory_platform_name});
    }
}

export class HomebridgeAccessory extends PluginAccessory {
    constructor(server, accessory, platform_accessory) {
        super(server, accessory, null);

        Object.defineProperty(this, 'platform_accessory', {value: platform_accessory});
    }
}
