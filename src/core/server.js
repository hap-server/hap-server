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

import isEqual from 'lodash.isequal';

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
        this.accessory_platforms = [];
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

        const plugin_accessory = new PluginStandaloneAccessory(this, accessory, plugin, accessory_type,
            accessory_config.uuid);

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

    /**
     * Loads an accessory platform.
     *
     * @param {object} config
     * @return {Promise}
     */
    async loadAccessoryPlatform(config) {
        const {plugin: plugin_name, platform: accessory_platform_name, name} = config;

        // eslint-disable-next-line curly
        if (!plugin_name || !accessory_platform_name || !name) throw new Error('Invalid accessory platform' +
            ' configuration: accessory platforms must have the plugin, platform and name properties');

        const plugin = PluginManager.getPlugin(plugin_name);
        if (!plugin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const AccessoryPlatformHandler = plugin.getAccessoryPlatformHandler(accessory_platform_name);
        if (!AccessoryPlatformHandler) throw new Error('No accessory platform handler with the name "' + // eslint-disable-line curly
            accessory_platform_name + '"');

        if (!config.uuid) config.uuid = 'accessoryplatform:' + plugin_name + ':' + accessory_platform_name + ':' + name;

        // eslint-disable-next-line curly
        if (this.accessory_platforms.find(p => p.config.uuid === config.uuid)) throw new Error('Already have an' +
            ' accessory platform with the UUID base "' + accessory.config.uuid + '"');

        const cached_accessories = this.getCachedAccessoryPlatformAccessories(config.uuid, plugin, accessory_platform_name)
            .map(plugin_accessory => plugin_accessory.accessory);

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
     * @return {Promise}
     */
    async handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context) {
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
            },
            plugin: this.plugin.name,
            uuid: this.uuid,
            accessory_type: this.accessory_type,
            base_uuid: this.base_uuid,
            accessory_platform: this.accessory_platform_name,
            data: this.data,
        };
    }

    /**
     * Create an accessory from cached data.
     *
     * @param {Server} server
     * @param {object} cache The cached data returned from pluginaccessory.cache
     */
    static restore(server, cache) {
        const plugin = PluginManager.getPlugin(cache.plugin);
        if (!plugin) throw new Error('Unknown plugin "' + cache.plugin + '"');

        const accessory_handler = cache.accessory_type ?
            plugin.getAccessoryHandler(cache.accessory_type) : undefined;
        if (cache.accessory_type && !accessory_handler) throw new Error('Unknown accessory "' + // eslint-disable-line curly
            cache.accessory_type + '"');

        const accessory_platform_handler = cache.accessory_platform ?
            plugin.getAccessoryPlatformHandler(cache.accessory_platform) : undefined;
        if (cache.accessory_platform && !accessory_platform_handler) throw new Error('Unknown accessory platform "' + // eslint-disable-line curly
            cache.accessory_platform + '"');

        if (!accessory_handler && !accessory_platform_handler) throw new Error('Invalid cache data');

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

        const plugin_accessory = accessory_platform_handler ?
            new PluginAccessoryPlatformAccessory(server, accessory, plugin, cache.accessory_platform, cache.base_uuid) :
            new PluginStandaloneAccessory(server, accessory, plugin, cache.accessory_type, cache.uuid);

        return plugin_accessory;
    }
}

export class PluginStandaloneAccessory extends PluginAccessory {
    constructor(server, accessory, plugin, accessory_type, uuid) {
        super(server, accessory, plugin);

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
