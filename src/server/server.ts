/// <reference path="../types/express-csp.d.ts" />

import http from 'http';
import https from 'https';
import net from 'net';
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

import isEqual from 'lodash.isequal';

import Events from '../events';
import {
    AutomationRunningEvent, SceneTriggerEvent,
    SceneActivateProgressEvent, SceneActivatedEvent, SceneDeactivateProgressEvent, SceneDeactivatedEvent,
} from '../events/server';

import AccessoryManager from './accessories';
import {HAPIP as HAPIPDiscovery, HAPBLE as HAPBLEDiscovery} from '../accessory-discovery';

import Connection from './connection';
import PluginManager, {ServerPlugin, DiscoveredAccessory} from './plugins';
import Logger from '../common/logger';
import {Accessory, Characteristic} from 'hap-nodejs';

import Automations from '../automations';

import {events} from '..';

// Types
import {AccessoryDiscovery} from './plugins';
import AutomationTrigger from '../automations/trigger';
import AutomationCondition from '../automations/condition';
import AutomationAction from '../automations/action';

interface ServerOptions {
    data_path: string;
    config_path: string;
    config: any;
    cli_auth_token?: string;
    hostname?: string;

    // For development builds there's also a webpack_hot property
    // webpack_hot = false;
}

const DEVELOPMENT = true;

export default class Server extends Events {
    static instances = new Set<Server>();

    hostname?: string;
    readonly config: any;
    readonly assets_path: string;
    readonly cli_auth_token?: string;
    setup_token?: string;
    readonly storage!: persist.LocalStorage;
    readonly log!: Logger;

    readonly accessories!: AccessoryManager;
    // readonly accessories!: PluginAccessory[];
    // readonly accessory_platforms!: AccessoryPlatform[];
    // readonly cached_accessories!: PluginAccessory[];
    // readonly bridges!: Bridge[];

    // readonly homebridge: Homebridge | null = null;
    readonly plugins!: Map<number, ServerPlugin>;

    private readonly config_automation_triggers: {[key: string]: AutomationTrigger} | null = null;
    private readonly config_automation_conditions: {[key: string]: AutomationCondition} | null = null;
    private readonly config_automation_actions: {[key: string]: AutomationAction} | null = null;

    private accessory_discovery_counter!: number;
    private readonly accessory_discovery_handlers!: Set<AccessoryDiscovery>;
    private readonly accessory_discovery_handlers_events!: WeakMap<AccessoryDiscovery, {
        [key: string]: (...args: any[]) => void;
    }>;

    readonly app!: express.Application;
    readonly wss!: WebSocket.Server;
    readonly multer!: multer.Instance;

    // private readonly characteristic_change_handlers!: WeakMap<typeof Accessory, Function>;
    // readonly _handleCharacteristicUpdate: any;
    // private readonly configuration_change_handlers!: WeakMap<typeof Accessory, Function>;
    // private readonly _handleConfigurationChange: any;

    // private readonly _handleRegisterHomebridgePlatformAccessories: any;
    // private readonly _handleUnregisterHomebridgePlatformAccessories: any;
    // private readonly _handleRegisterExternalHomebridgeAccessories: any;

    /**
     * Creates a Server.
     *
     * @param {object} options
     * @param {string} options.data_path
     * @param {string} options.config_path
     * @param {object} options.config
     * @param {string} options.cli_auth_token
     * @param {string} [options.hostname]
     * @param {persist} storage
     * @param {Logger} [log]
     */
    constructor(options: ServerOptions, storage: persist.LocalStorage, log?: Logger) {
        super();

        this.parent_emitter = events;

        Object.defineProperty(this, 'hostname', {enumerable: true, writable: true, value: options.hostname || null});
        Object.defineProperty(this, 'config', {enumerable: true, value: options.config || {}});
        Object.defineProperty(this, 'cli_auth_token', {value: options.cli_auth_token});
        Object.defineProperty(this, 'storage', {value: storage});
        Object.defineProperty(this, 'log', {value: log || new Logger()});

        Object.defineProperty(this, 'accessories', {value: new AccessoryManager(this)});
        // Object.defineProperty(this, 'accessories', {value: []});
        // Object.defineProperty(this, 'accessory_platforms', {value: []});
        // Object.defineProperty(this, 'cached_accessories', {value: []});
        // Object.defineProperty(this, 'bridges', {value: []});

        // Object.defineProperty(this, 'homebridge', {writable: true});
        Object.defineProperty(this, 'config_automation_triggers', {writable: true});
        Object.defineProperty(this, 'config_automation_conditions', {writable: true});
        Object.defineProperty(this, 'config_automation_actions', {writable: true});

        Object.defineProperty(this, 'accessory_discovery_counter', {writable: true, value: 0});
        Object.defineProperty(this, 'accessory_discovery_handlers', {value: new Set()});
        Object.defineProperty(this, 'accessory_discovery_handlers_events', {value: new WeakMap()});

        Object.defineProperty(this, 'app', {value: express()});
        Object.defineProperty(this, 'multer', {value: multer({dest: os.tmpdir()})});
        Object.defineProperty(this, 'wss', {value: new WebSocket.Server({noServer: true})});

        Object.defineProperty(this, 'plugins', {value: new Map()});

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

        this.app.post('/assets/upload-layout-background', this.multer.single('background'),
            Connection.handleUploadLayoutBackground.bind(Connection, this) as any);

        this.app.use((req, res, next) => {
            if (req.url.match(/^\/layout\/[^/]+$/) ||
                req.url.match(/^\/all-accessories$/) ||
                req.url.match(/^\/automations$/) ||
                req.url.match(/^\/setup(\?.*)?$/)) req.url = '/index.html';

            next();
        });

        if (!DEVELOPMENT || !(options as any).webpack_hot) {
            this.app.use(express.static(path.resolve(__dirname, '..', 'public')));
        }

        if (DEVELOPMENT && (options as any).webpack_hot) {
            const webpack = require('webpack'); // eslint-disable-line @typescript-eslint/no-var-requires
            const devmiddleware = require('webpack-dev-middleware'); // eslint-disable-line @typescript-eslint/no-var-requires
            const hotmiddleware = require('webpack-hot-middleware'); // eslint-disable-line @typescript-eslint/no-var-requires
            require('babel-register');

            const compiler = webpack(require('../../gulpfile.babel').webpack_hot_config);

            this.app.use(devmiddleware(compiler));
            this.app.use(hotmiddleware(compiler));
        }

        this.wss.on('connection', (ws, req) => this.handleWebsocketConnection(ws, req));

        this.handle = this.handle.bind(this);
        this.upgrade = this.upgrade.bind(this);

        Server.instances.add(this);

        this.on(AutomationRunningEvent, event => {
            // Only send events for automations that the web interface knows about
            if (!event.runner.automation.uuid) return;

            const onprogress = (progress: number) => this.sendBroadcast({
                type: 'automation-progress',
                runner_id: event.runner.id,
                progress,
            });
            const onfinished = () => {
                event.runner.removeListener('progress', onprogress);
                event.runner.removeListener('finished', onfinished);

                this.sendBroadcast({
                    type: 'automation-finished',
                    runner_id: event.runner.id,
                });
            };

            event.runner.on('progress', onprogress);
            event.runner.on('finished', onfinished);

            this.sendBroadcast({
                type: 'automation-running',
                runner_id: event.runner.id,
                automation_uuid: event.runner.automation.uuid,
            });
        });

        this.on(SceneTriggerEvent, event => this.sendBroadcast({
            type: event.enable ? 'scene-activating' : 'scene-disabling',
            uuid: event.scene.uuid,
            context: event.context,
        }));
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
    }

    /**
     * Creates a Server.
     *
     * @param {object} options
     * @param {string} options.data_path
     * @param {string} options.config_path
     * @param {object} options.config
     * @param {string} options.cli_auth_token
     * @param {string} [options.hostname]
     * @return {Server}
     */
    static async createServer(options: ServerOptions) {
        // if (!options) options = {};

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

        const wrapConsoleFn = (fn: typeof console.log, type: 'stdout' | 'stderr') =>
            Logger.wrapConsoleFn(fn, (data: any, ...args: any[]) => {
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
            });

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
    async loadPlugin(server_plugin: typeof ServerPlugin, config?: any) {
        if (typeof server_plugin !== 'function' || !(server_plugin.prototype instanceof ServerPlugin)) {
            throw new Error('server_plugin must be a class that extends ServerPlugin');
        }

        if (this.plugins.has(server_plugin.id)) {
            throw new Error('Already have a server plugin with the ID "' + server_plugin.id + '"');
        }

        // @ts-ignore
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
    getPlugin(id: ServerPlugin | typeof ServerPlugin | number): ServerPlugin | null {
        if (typeof id === 'function' || typeof id === 'object') id = id.id;

        return this.plugins.get(id as number) || null;
    }

    loadBridgesFromConfig() {
        if (!this.config.bridges) return Promise.resolve();

        return Promise.all(this.config.bridges.map((bridge_config: any) => this.accessories.loadBridge(bridge_config)));
    }

    async loadBridgesFromStorage(dont_throw = false) {
        const bridge_uuids: string[] = await this.storage.getItem('Bridges') || [];

        return Promise.all(bridge_uuids.map(async uuid => {
            try {
                const data = await this.storage.getItem('Bridge.' + uuid) || {};
                return this.accessories.loadBridge(data, uuid);
            } catch (err) {
                if (!dont_throw && typeof dont_throw !== 'undefined') throw err;

                this.log.warn('Error loading bridge', uuid, err);
            }
        }));
    }

    // bridges

    async loadCachedAccessories(dont_throw = false) {
        const cached_accessories: any[] = await this.storage.getItem('CachedAccessories') || [];

        await Promise.all(cached_accessories.map(cache => this.accessories.loadCachedAccessory(cache).catch(err => {
            if (!dont_throw && typeof dont_throw !== 'undefined') throw err;

            this.log.warn('Error restoring cached accessory', cache.plugin, cache.accessory.displayName, err);
        })));
    }

    /**
     * Saves data from all accessories to cache.
     *
     * @return {Promise}
     */
    async saveCachedAccessories() {
        const cached_accessories = await Promise.all(this.accessories.accessories
            .concat(this.accessories.cached_accessories).map(accessory => accessory.cache()));

        await this.storage.setItem('CachedAccessories', cached_accessories);
    }

    async loadAccessoriesFromConfig() {
        await this.loadAccessories(this.config.accessories2 || [], true);
    }

    async loadAccessories(accessories: any[], dont_throw = false) {
        await Promise.all(accessories.map(accessory_config =>
            this.accessories.loadAccessory(accessory_config).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading accessory', accessory_config.plugin, accessory_config.accessory,
                    accessory_config.name, err);
            })));
    }

    async loadAccessoryPlatformsFromConfig() {
        await this.loadAccessoryPlatforms(this.config.platforms2 || [], true);
    }

    async loadAccessoryPlatforms(accessories: any[], dont_throw = false) {
        await Promise.all(accessories.map(accessory_platform_config =>
            this.accessories.loadAccessoryPlatform(accessory_platform_config).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading accessory platform', accessory_platform_config.plugin,
                    accessory_platform_config.platform, accessory_platform_config.name, err);
            })));
    }

    get automations(): Automations {
        return Object.defineProperty(this, 'automations', {value: new Automations(this)}).automations;
    }

    async loadAutomationTriggersFromConfig(dont_throw = false) {
        if (this.config_automation_triggers) return this.config_automation_triggers;
        const triggers: {[key: string]: AutomationTrigger} = {};

        await Promise.all((Object.entries(this.config['automation-triggers'] || {}) as any)
            .map(([key, config]: [string, any]) =>
                this.automations.loadAutomationTrigger(config).then(t => triggers[key] = t).catch(err => {
                    if (!dont_throw) throw err;

                    this.log.warn('Error loading automation trigger', config.plugin, config.trigger, err);
                })));

        return (this as any).config_automation_triggers = triggers;
    }

    async loadAutomationConditionsFromConfig(dont_throw = false) {
        if (this.config_automation_conditions) return this.config_automation_conditions;
        const conditions: {[key: string]: AutomationCondition} = {};

        await Promise.all((Object.entries(this.config['automation-conditions'] || {}) as any)
            .map(([key, config]: [string, any]) => this.automations.loadAutomationCondition(config)
                .then(t => conditions[key] = t).catch(err => {
                    if (!dont_throw) throw err;

                    this.log.warn('Error loading automation condition', config.plugin, config.condition, err);
                })));

        return (this as any).config_automation_conditions = conditions;
    }

    async loadAutomationActionsFromConfig(dont_throw = false) {
        if (this.config_automation_actions) return this.config_automation_actions;
        const actions: {[key: string]: AutomationAction} = {};

        await Promise.all((Object.entries(this.config['automation-actions'] || {}) as any)
            .map(([key, config]: [string, any]) =>
                this.automations.loadAutomationAction(config).then(t => actions[key] = t).catch(err => {
                    if (!dont_throw) throw err;

                    this.log.warn('Error loading automation action', config.plugin, config.action, err);
                })));

        return (this as any).config_automation_actions = actions;
    }

    async loadAutomationsFromConfig(dont_throw = false) {
        const [triggers, conditions, actions] = await Promise.all([
            this.loadAutomationTriggersFromConfig(dont_throw),
            this.loadAutomationConditionsFromConfig(dont_throw),
            this.loadAutomationActionsFromConfig(dont_throw),
        ]);

        const automations = await Promise.all((this.config.automations || []).map((config: any) =>
            this.automations.loadAutomation(config).then(automation => {
                automation.addTrigger(...(automation.config.triggers || []).map((key: string) => triggers[key]));
                automation.addCondition(...(automation.config.conditions || []).map((key: string) => conditions[key]));
                automation.addAction(...(automation.config.actions || []).map((key: string) => actions[key]));

                return automation;
            }).catch(err => {
                if (!dont_throw) throw err;

                this.log.warn('Error loading automation', config, err);
            })));

        this.log.info('Loaded automations', automations);

        return {automations, triggers, conditions, actions};
    }

    async loadAutomationsFromStorage() {
        const automation_uuids: string[] = await this.storage.getItem('Automations') || [];

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
    loadOrUpdateAutomation(uuid: string, data: any) {
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
    async loadAutomation(uuid: string, data: any) {
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
    async updateAutomation(uuid: string, data: any) {
        const automation = this.automations.automations.find(automation => automation.uuid === uuid);
        if (!automation) throw new Error('Unknown automation "' + uuid + '"');

        const nullchildren: any = {triggers: undefined, conditions: undefined, actions: undefined};

        if (!isEqual(
            Object.assign({}, nullchildren, data, nullchildren),
            Object.assign({}, nullchildren, automation.config, nullchildren)
        )) {
            // Top level configuration has changed
            // This isn't actually used for anything yet
            const automation = this.automations.automations.find(automation => automation.uuid === uuid);
            if (automation) await this.automations.removeAutomation(automation);
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
            if (trigger.uuid && (data.triggers || {})[trigger.uuid]) continue;

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
            if (condition.uuid && (data.conditions || {})[condition.uuid]) continue;

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
            if (action.uuid && (data.actions || {})[action.uuid]) continue;

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
    getAutomation(id: number) {
        if (!this.hasOwnProperty('automations')) return null;

        return this.automations.getAutomation(id);
    }

    async loadScenesFromStorage() {
        const scene_uuids: string[] = await this.storage.getItem('Scenes') || [];

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
    loadOrUpdateScene(uuid: string, data: any) {
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
    async loadScene(uuid: string, data: any) {
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
    async updateScene(uuid: string, data: any) {
        const scene = this.automations.scenes.find(scene => scene.uuid === uuid);
        if (!scene) throw new Error('Unknown scene "' + uuid + '"');

        const nullchildren: any = {conditions: undefined, enable_actions: undefined, disable_actions: undefined};

        if (!isEqual(
            Object.assign({}, nullchildren, data, nullchildren),
            Object.assign({}, nullchildren, scene.config, nullchildren)
        )) {
            // Top level configuration has changed
            // This isn't actually used for anything yet
            const scene = this.automations.scenes.find(scene => scene.uuid === uuid);
            if (scene) await this.automations.removeScene(scene);
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
            if (condition.uuid && (data.conditions || {})[condition.uuid]) continue;

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
            if (action.uuid && (data.enable_actions || {})[action.uuid]) continue;

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
            added_disable_actions.push(new_action);
        }

        for (const action of scene.disable_actions) {
            if (action.uuid && (data.disable_actions || {})[action.uuid]) continue;

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

            if (!events.add_accessory) events.add_accessory = (data: any) => // eslint-disable-line curly
                this.handleAddDiscoveredAccessory(accessory_discovery, data);
            accessory_discovery.on('add-accessory', events.add_accessory);
            if (!events.remove_accessory) events.remove_accessory = (data: any) => // eslint-disable-line curly
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
    handleAddDiscoveredAccessory(
        accessory_discovery: AccessoryDiscovery, discovered_accessory: DiscoveredAccessory
    ) {
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
    handleRemoveDiscoveredAccessory(
        accessory_discovery: AccessoryDiscovery, discovered_accessory: DiscoveredAccessory
    ) {
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
        for (const bridge of this.accessories.bridges) {
            bridge.publish();
        }
    }

    /**
     * Unpublishes all HAP bridges.
     */
    unpublish() {
        for (const bridge of this.accessories.bridges) {
            bridge.unpublish();
        }
    }

    /**
     * Gets an Accessory.
     *
     * @param {string} uuid
     * @return {Accessory}
     */
    getAccessory(uuid: string): typeof Accessory | null {
        return this.accessories.getAccessory(uuid);
    }

    /**
     * Gets a PluginAccessory.
     *
     * @param {string} uuid
     * @return {PluginAccessory}
     */
    getPluginAccessory(uuid: string) {
        return this.accessories.getPluginAccessory(uuid);
    }

    /**
     * Gets a Service.
     *
     * @param {(string|Array)} uuid
     * @param {string} [service_uuid]
     * @return {Service}
     */
    getService(uuid: string | string[], service_uuid?: string) {
        return this.accessories.getService(uuid, service_uuid);
    }

    /**
     * Gets a Characteristic.
     *
     * @param {(string|Array)} uuid
     * @param {string} [service_uuid]
     * @param {string} [characteristic_uuid]
     * @return {Characteristic}
     */
    getCharacteristic(uuid: string | string[], service_uuid?: string, characteristic_uuid?: string) {
        return this.accessories.getCharacteristic(uuid, service_uuid, characteristic_uuid);
    }

    /**
     * Gets a characteristic's value.
     *
     * @param {Characteristic|string} characteristic
     * @param {any} [context]
     * @param {string} [connection_id]
     * @return {Promise<any>}
     */
    getCharacteristicValue(
        characteristic: typeof Characteristic | string | string[], context?: any, connection_id?: string
    ): Promise<any> {
        if (!(characteristic instanceof Characteristic)) {
            characteristic = this.getCharacteristic(characteristic as string | string[]);
        }

        return new Promise((resolve, reject) => {
            characteristic.getValue(
                (err: Error, value: any) => err ? reject(err) : resolve(value), context, connection_id);
        });
    }

    /**
     * Sets a characteristic's value.
     *
     * @param {Characteristic|string} characteristic
     * @param {any} value
     * @param {any} [context]
     * @param {string} [connection_id]
     * @return {Promise<any>}
     */
    setCharacteristicValue(
        characteristic: typeof Characteristic | string | string[], value: any, context?: any, connection_id?: string
    ): Promise<void> {
        if (!(characteristic instanceof Characteristic)) characteristic = this.getCharacteristic(characteristic);

        return new Promise((resolve, reject) => {
            characteristic.setValue(value, (err: Error) => err ? reject(err) : resolve(), context, connection_id);
        });
    }

    /**
     * Creates a HTTP server.
     *
     * @param {object} options
     * @param {function} middleware
     * @return {http.Server}
     */
    createServer(
        options: http.ServerOptions,
        middleware?: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void
    ) {
        const server = http.createServer(options);

        server.on('request', middleware ? (req, res) => {
            middleware(req, res, () => this.handle(req, res));
        } : this.handle);
        server.on('upgrade', this.upgrade);

        return server;
    }

    /**
     * Creates a HTTPS server.
     *
     * @param {object} options
     * @param {function} middleware
     * @return {https.Server}
     */
    createSecureServer(
        options: http.ServerOptions,
        middleware?: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void
    ) {
        const server = https.createServer(options);

        server.on('request', middleware ? (req, res) => {
            middleware(req, res, () => this.handle(req, res));
        } : this.handle);
        server.on('upgrade', this.upgrade);

        return server;
    }

    /**
     * Handles a HTTP request.
     *
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     * @param {function} next
     */
    handle(req: http.IncomingMessage, res: http.ServerResponse, next?: () => void) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'deny');
        res.setHeader('X-XSS-Protection', '1');
        res.setHeader('Feature-Policy', '');

        const {pathname} = url.parse(req.url!);

        const ui_plugin_match = pathname && pathname.match(/^\/(ui-plugin|accessory-ui)\/([0-9]+)(\/.*)?$/);

        if (ui_plugin_match) {
            const ui_plugin_id = parseInt(ui_plugin_match[2]);
            const ui_plugin_pathname = ui_plugin_match[3] || '/';

            req.url = ui_plugin_pathname;

            const ui_plugin = PluginManager.getWebInterfacePlugin(ui_plugin_id);
            if (!ui_plugin) {
                res.end('Cannot ' + req.method + ' ' + pathname);
                return;
            }

            this.log.debug('Passing request to web interface plugin', ui_plugin_id, ui_plugin_pathname);
            ui_plugin.handle(req, res, next);
        } else if (pathname === '/websocket') {
            // If path is /websocket tell the client to upgrade the request
            const body = http.STATUS_CODES[426]!;

            res.writeHead(426, {
                'Content-Length': body.length,
                'Content-Type': 'text/plain',
            });

            res.end(body);
        } else {
            // Send all other requests to Express
            // @ts-ignore
            this.app.handle(req, res, next);
        }
    }

    /**
     * Handles a HTTP upgrade.
     *
     * @param {http.IncomingMessage} request
     * @param {net.Socket} socket
     * @param {*} head
     */
    upgrade(request: http.IncomingMessage, socket: net.Socket, head: Buffer) {
        if (url.parse(request.url!).pathname !== '/websocket') {
            socket.destroy();
        }

        this.wss.handleUpgrade(request, socket, head, ws => {
            this.wss.emit('connection', ws, request);
        });
    }

    handleWebsocketConnection(ws: WebSocket, req: http.IncomingMessage) {
        new Connection(this, ws, req);
    }

    /**
     * Sends a broadcast message.
     *
     * @param {*} data
     * @param {Array} except An array of WebSocket clients to not send the message to
     */
    sendBroadcast(data: any, except?: WebSocket | Connection | (WebSocket | Connection)[]) {
        const message = '**:' + JSON.stringify(data);

        for (const ws of this.wss.clients) {
            if (ws.readyState !== WebSocket.OPEN) continue;
            if (except && except === ws || except instanceof Array && except.includes(ws)) continue;

            const connection = Connection.getConnectionForWebSocket(ws);
            if (!connection) continue;
            if (except && except === connection || except instanceof Array && except.includes(connection)) continue;

            if (!connection.permissions.checkShouldReceiveBroadcast(data)) continue;

            ws.send(message);
        }
    }

    /**
     * Deletes all unused assets.
     *
     * @return {Promise<object>}
     */
    async cleanAssets() {
        const home_settings = await this.storage.getItem('Home');

        const layouts: any[] = await Promise.all((await this.storage.getItem('Layouts') || [])
            .map((uuid: string) => this.storage.getItem('Layout.' + uuid)));
        const background_urls = [...new Set(layouts.map(l => l && l.background_url).filter(b => b))];

        const assets = await new Promise<string[]>((rs, rj) =>
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

Server.patchStdout();
