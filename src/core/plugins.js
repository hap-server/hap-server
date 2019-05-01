
import Module from 'module';
import fs from 'fs';
import path from 'path';
import util from 'util';
import crypto from 'crypto';

import semver from 'semver';
import persist from 'node-persist';
import express from 'express';
import hap from 'hap-nodejs';
import * as HapAsync from './hap-async';

import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';

import Logger from './logger';
import AutomationTrigger from '../automations/trigger';
import AutomationCondition from '../automations/condition';
import AutomationAction from '../automations/action';

import {version as hap_server_version} from '..';

const fs_stat = util.promisify(fs.stat);
const fs_readdir = util.promisify(fs.readdir);

const log = new Logger('Plugins');

let instance;
let storage_path;

export class PluginManager {
    constructor() {
        this.plugins = [];
        this.plugin_paths = PluginManager.getDefaultPaths();
        this.plugin_apis = new WeakMap();
        this.plugin_storage = new Map();
        this.plugin_config = new Map();
        this.default_plugin_config = {};
    }

    static get instance() {
        return instance || (instance = new PluginManager());
    }

    get storage_path() {
        if (!storage_path) {
            throw new Error('Storage path has not been set');
        }

        return storage_path;
    }

    set storage_path(new_storage_path) {
        if (PluginManager.instance.plugin_storage.size) {
            throw new Error('Cannot set storage path after using storage');
        }

        storage_path = new_storage_path;
    }

    static getDefaultPaths() {
        const paths = [];

        if (process.platform === 'win32') {
            paths.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
        } else {
            paths.push('/usr/local/lib/node_modules', '/usr/lib/node_modules');
        }

        return paths;
    }

    static requirePatch() {
        const module_load = Module._load;

        Module._load = function(request, parent, isMain) {
            if (request === 'hap-server-api' || request.startsWith('hap-server-api/')) {
                const plugin = PluginManager.instance.getPluginByModule(parent);

                if (plugin) {
                    log.withPrefix(plugin.name)
                        .warn('Using deprecated hap-server-api/* module. Use @hap-server/api/* instead.');

                    const module = PluginManager.requireApi('@hap-server/api' + request.substr(14), plugin, parent);

                    if (module) return module;
                }
            }

            if (request === '@hap-server/api' || request.startsWith('@hap-server/api/')) {
                const plugin = PluginManager.instance.getPluginByModule(parent);

                if (plugin) {
                    const module = PluginManager.requireApi(request, plugin, parent);

                    if (module) return module;
                }
            }

            // eslint-disable-next-line prefer-rest-params
            return module_load.apply(this, arguments);
        };
    }

    getPluginByModule(module) {
        return this.plugins.find(plugin => module.filename === plugin.path ||
            module.filename.startsWith(plugin.path + path.sep));
    }

    static requireApi(request, plugin, parent) {
        if (request === '@hap-server/api') {
            let plugin_api = PluginManager.instance.plugin_apis.get(plugin);

            // eslint-disable-next-line curly
            if (!plugin_api) PluginManager.instance.plugin_apis.set(plugin, plugin_api = Object.freeze({
                __esModule: true,
                plugin,
                parent_module: parent,
                default: new PluginAPI(plugin, parent),
                log: new Logger(plugin.name),
                AccessoryPlatform: AccessoryPlatform.bind(AccessoryPlatform, plugin),
                AccessoryUI: AccessoryUI.bind(AccessoryUI, plugin),
                AccessoryDiscovery: AccessoryDiscovery.bind(AccessoryDiscovery, plugin),
                AccessorySetup: AccessorySetup.bind(AccessorySetup, plugin),
                AuthenticationHandler: AuthenticationHandler.bind(AuthenticationHandler, plugin),
                AuthenticatedUser: AuthenticatedUser.bind(AuthenticatedUser, plugin),
                AutomationTrigger,
                AutomationCondition,
                AutomationAction,
            }));

            return plugin_api;
        } else if (request === '@hap-server/api/plugin-config') {
            if (!plugin.name) {
                throw new Error('Plugin configuration is only available for plugins with a name');
            }

            let plugin_config = PluginManager.instance.plugin_config.get(plugin.name);

            // eslint-disable-next-line curly
            if (!plugin_config) PluginManager.instance.plugin_config.set(plugin.name, plugin_config = {});

            return plugin_config;
        } else if (request === '@hap-server/api/storage') {
            if (!plugin.name) {
                throw new Error('Storage is only available for plugins with a name');
            }

            let plugin_storage = PluginManager.instance.plugin_storage.get(plugin.name);

            // eslint-disable-next-line curly
            if (!plugin_storage) PluginManager.instance.plugin_storage.set(plugin.name, plugin_storage = Object.freeze({
                __esModule: true,
                default: persist.create({
                    dir: path.resolve(PluginManager.instance.storage_path, plugin.name),
                    stringify: data => (JSON.stringify(data, null, 4) + '\n'),
                }),
            }));

            return plugin_storage;
        } else if (request === '@hap-server/api/hap') {
            return hap;
        } else if (request === '@hap-server/api/hap-async') {
            return HapAsync;
        } else if (request === '@hap-server/api/express') {
            return express;
        }

        log.warn(plugin.name, 'tried to load an unknown virtual @hap-server/api/* module');
    }

    async loadPlugin(plugin_path) {
        plugin_path = path.resolve(plugin_path);

        const stat = await fs_stat(plugin_path);
        let package_json;

        if (stat.isDirectory()) {
            package_json = require(path.resolve(plugin_path, 'package.json'));

            if (!package_json.name) {
                throw new Error('"' + plugin_path + '" doesn\'t have a name in it\'s package.json');
            }

            if (!package_json.engines || !package_json.engines['@hap-server/hap-server'] ||
                !package_json.keywords || !package_json.keywords.includes('hap-server-plugin')) {
                throw new Error('"' + package_json.name + '" is not a hap-server plugin');
            }

            if (!semver.satisfies(hap_server_version, package_json.engines['@hap-server/hap-server'])) {
                throw new Error('"' + package_json.name + '" requires a hap-server version of '
                    + package_json.engines['@hap-server/hap-server'] + ' - you have version ' + hap_server_version);
            }

            if (package_json.engines.node && !semver.satisfies(process.version, package_json.engines.node)) {
                log.warn('"' + package_json.name + '" requires a Node.js version of '
                    + package_json.engines.node + ' - you have version ' + process.version);
            }
        }

        if (this.plugins.find(plugin => plugin.path === plugin_path)) return plugin;

        const name = package_json ? package_json.name : plugin_path;

        if (this.plugins.find(plugin => plugin.name === name)) {
            console.error('Already loaded a plugin with the same name as "' + plugin_path + '"');
            return;
        }

        const plugin = new Plugin(this, plugin_path, package_json ? package_json.name : undefined);

        this.plugins.push(plugin);

        try {
            const module_path = require.resolve(plugin_path);
            require(plugin_path);

            plugin.module = require.cache[module_path];
        } catch (err) {
            log.error('Error loading plugin', name, err);
        }

        // If the plugin requires storage, initialise it now
        const plugin_storage = PluginManager.instance.plugin_storage.get(plugin.name);

        Object.defineProperty(plugin, 'storage_initialised', {value: !!plugin_storage});

        if (plugin_storage) {
            log.info('Initialising plugin storage for', plugin.name);
            await plugin_storage.default.init();
        }

        if (plugin.module && plugin.module.exports.init) {
            plugin.module.exports.init.call(plugin);
        }

        return plugin;
    }

    addPluginPath(path) {
        this.plugin_paths.unshift(path);
        HomebridgePluginManager.addPluginPath(path);
    }

    loadPlugins() {
        return Promise.all(this.plugin_paths.map(plugin_path => this._loadPlugin(plugin_path)));
    }

    async _loadPlugin(plugin_path, scoped_packages) {
        if (!scoped_packages) {
            try {
                const stat = await fs_stat(plugin_path);

                if (stat.isFile()) {
                    return await this.loadPlugin(plugin_path);
                }
            } catch (err) {
                return;
            }

            try {
                // eslint-disable-next-line no-unused-vars
                const package_stat = await fs_stat(path.join(plugin_path, 'package.json'));

                return await this.loadPlugin(plugin_path);
            } catch (err) {}
        }

        return Promise.all((await fs_readdir(plugin_path)).map(async dir => {
            const plugin_dir = path.join(plugin_path, dir);
            const stat = await fs_stat(plugin_dir);
            if (!stat.isDirectory()) return log.error(plugin_dir, 'is not a directory');

            try {
                if (dir.startsWith('@')) return await this._loadPlugin(plugin_dir, true);
                return await this.loadPlugin(plugin_dir);
            } catch (err) {}
        }));
    }

    getPlugin(plugin_name) {
        return this.plugins.find(plugin => plugin.name === plugin_name || plugin.path === plugin_name);
    }

    setPluginConfig(plugin_name, config) {
        this.plugin_config.set(plugin_name, config);
    }

    getAccessoryUIs(include_disabled) {
        return this.plugins.map(plugin => plugin.enabled || include_disabled ?
            plugin.getAccessoryUIs(include_disabled) : []).reduce((acc, val) => acc.concat(val), []);
    }

    getAccessoryUI(id, include_disabled) {
        for (const plugin of this.plugins) {
            if (!plugin.enabled && !include_disabled) continue;

            const accessory_ui = plugin.getAccessoryUI(id);
            if (!accessory_ui || (!accessory_ui.enabled && !include_disabled)) continue;

            return accessory_ui;
        }
    }

    getAuthenticationHandlers(include_disabled) {
        return this.plugins.map(plugin => plugin.enabled || include_disabled ?
            plugin.getAuthenticationHandlers() : []).reduce((acc, val) => acc.concat(val), []);
    }

    getAuthenticationHandler(id, include_disabled) {
        for (const plugin of this.plugins) {
            if (!plugin.enabled && !include_disabled) continue;

            for (const authentication_handler of plugin.authentication_handlers.values()) {
                if (!authentication_handler.enabled && !include_disabled) continue;

                if (authentication_handler.id === id) return authentication_handler;
            }
        }
    }
}

export default PluginManager.instance;

export class Plugin {
    constructor(plugin_manager, path, name) {
        this.plugin_manager = plugin_manager;
        this.path = path;
        this.name = name;

        this.accessories = new Map();
        this.accessory_platforms = new Map();
        this.accessory_ui = new Set();
        this.accessory_discovery = new Set();
        this.accessory_setup = new Map();
        this.authentication_handlers = new Map();
        this.automation_triggers = new Map();
        this.automation_conditions = new Map();
        this.automation_actions = new Map();
    }

    get config() {
        if (!this.name) {
            throw new Error('Plugin configuration is only available for plugins with a name');
        }

        return this.plugin_manager.plugin_config.get(this.name) || {};
    }

    get enabled() {
        if (!this.name) return true;

        const config = this.plugin_manager.plugin_config.get(this.name);

        if (typeof config !== 'undefined') return !!config;

        return !!this.plugin_manager.default_plugin_config;
    }

    getAccessoryHandler(name) {
        return this.accessories.get(name);
    }

    registerAccessory(name, handler) {
        if (typeof handler !== 'function') {
            throw new Error('handler must be a function');
        }

        if (this.accessories.has(name)) {
            throw new Error(this.name + ' has already registered an accessory with the name "' + name + '".');
        }

        log.info('Registering accessory', name, 'from plugin', this.name);

        this.accessories.set(name, handler);
    }

    getAccessoryPlatformHandler(name) {
        return this.accessory_platforms.get(name);
    }

    registerAccessoryPlatform(name, handler) {
        if ((name instanceof AccessoryPlatform.prototype || typeof name === 'function') && !handler) {
            handler = name;
            name = handler.name;
        }

        if (!(handler instanceof AccessoryPlatform.prototype) && typeof handler !== 'function') {
            throw new Error('handler must be a class that extends AccessoryPlatform or a function');
        }

        if (this.accessory_platforms.has(name)) {
            throw new Error(this.name + ' has already registered an accessory platform with the name "' + name + '".');
        }

        if (!(handler instanceof AccessoryPlatform.prototype)) {
            handler = AccessoryPlatform.withHandler(handler);
        }

        log.info('Registering accessory platform', name, 'from plugin', this.name);

        this.accessory_platforms.set(name, handler);

        return handler;
    }

    getAccessoryUIs(include_disabled) {
        return [...this.accessory_ui].filter(ui => ui.enabled || include_disabled);
    }

    getAccessoryUI(id) {
        for (const accessory_ui of this.accessory_ui) {
            if (accessory_ui.id == id) return accessory_ui;
        }
    }

    registerAccessoryUI(handler) {
        if (!(handler instanceof AccessoryUI)) {
            throw new Error('handler must be an AccessoryUI object');
        }

        log.info('Registering accessory UI from plugin', this.name);

        this.accessory_ui.add(handler);
    }

    getAccessoryDiscoveryHandlers(include_disabled) {
        return [...this.accessory_discovery].filter(discovery => discovery.enabled || include_disabled);
    }

    registerAccessoryDiscovery(handler) {
        if (!(handler instanceof AccessoryDiscovery)) {
            throw new Error('handler must be an AccessoryDiscovery object');
        }

        log.info('Registering accessory discovery handler from plugin', this.name);

        this.accessory_discovery.add(handler);
    }

    getAccessorySetupHandlers(include_disabled) {
        return [...this.accessory_setup.keys()]
            .filter(name => this.accessory_setup.get(name).enabled || include_disabled);
    }

    getAccessorySetupHandler(name) {
        return this.accessory_setup.get(name);
    }

    registerAccessorySetup(name, handler) {
        if (name instanceof AccessorySetup.prototype && !handler) {
            handler = name;
            name = handler.name;
        }

        if (!(handler instanceof AccessorySetup.prototype)) {
            throw new Error('handler must be a class that extends AccessorySetup');
        }

        if (this.accessory_setup.has(name)) {
            throw new Error(this.name + ' has already registered an accessory setup handler with the name "' +
                name + '".');
        }

        log.info('Registering accessory setup handler', name, 'from plugin', this.name);

        this.accessory_setup.set(name, handler);
    }

    getAuthenticationHandlers(include_disabled) {
        return [...this.authentication_handlers.keys()]
            .filter(name => this.authentication_handlers.get(name).enabled || include_disabled);
    }

    getAuthenticationHandler(name) {
        return this.authentication_handlers.get(name);
    }

    registerAuthenticationHandler(name, handler, disconnect_handler) {
        if (name instanceof AuthenticationHandler) {
            handler = name;
            name = handler.name;
        }

        name = '' + name;

        if (typeof handler !== 'function') {
            throw new Error('handler must be a function');
        }

        if (this.authentication_handlers.has(name)) {
            throw new Error(this.name + ' has already registered an authentication handler with the name "' +
                name + '".');
        }

        if (!(handler instanceof AuthenticationHandler)) {
            handler = new AuthenticationHandler(this, name, handler, disconnect_handler);
        }

        log.info('Registering authentication handler', name, 'from plugin', this.name);

        this.authentication_handlers.set(name, handler);
    }

    registerAutomationTrigger(name, handler) {
        if (name instanceof AutomationTrigger.prototype && !handler) {
            handler = name;
            name = handler.name;
        }

        if (!(handler instanceof AutomationTrigger.prototype)) {
            throw new Error('handler must be a class that extends AutomationTrigger');
        }

        if (this.automation_triggers.has(name)) {
            throw new Error(this.name + ' has already registered an automation trigger with the name "' + name + '".');
        }

        log.info('Registering automation trigger', name, 'from plugin', this.name);

        this.automation_triggers.set(name, handler);
    }

    registerAutomationCondition(name, handler) {
        if (name instanceof AutomationCondition.prototype && !handler) {
            handler = name;
            name = handler.name;
        }

        if (!(handler instanceof AutomationCondition.prototype)) {
            throw new Error('handler must be a class that extends AutomationCondition');
        }

        if (this.automation_conditions.has(name)) {
            throw new Error(this.name + ' has already registered an automation condition with the name "' + name + '".');
        }

        log.info('Registering automation condition', name, 'from plugin', this.name);

        this.automation_conditions.set(name, handler);
    }

    registerAutomationAction(name, handler) {
        if (name instanceof AutomationAction.prototype && !handler) {
            handler = name;
            name = handler.name;
        }

        if (!(handler instanceof AutomationAction.prototype)) {
            throw new Error('handler must be a class that extends AutomationAction');
        }

        if (this.automation_actions.has(name)) {
            throw new Error(this.name + ' has already registered an automation action with the name "' + name + '".');
        }

        log.info('Registering automation action', name, 'from plugin', this.name);

        this.automation_actions.set(name, handler);
    }
}

export class AccessoryPlatform {
    constructor(plugin, config) {
        Object.defineProperty(this, 'plugin', {value: plugin});
        Object.defineProperty(this, 'accessories', {value: new Set()});
        Object.defineProperty(this, 'config', {value: Object.freeze(config)});
    }

    static withHandler(handler) {
        return class extends AccessoryPlatform {
            async init(cached_accessories) {
                const accessories = await handler.call(this.plugin, this.config, cached_accessories);

                this.accessories = accessories;
            }
        };
    }

    static withDynamicHandler(handler) {
        return class extends AccessoryPlatform {
            async init(cached_accessories) {
                const accessories = await handler.call(this.plugin, this, this.config, cached_accessories);

                this.accessories = accessories;
            }
        };
    }

    async init(cached_accessories) {
        for (const cached_accessory of cached_accessories) {
            this.accessories.add(cached_accessory);
        }
    }

    addAccessory(accessory) {
        this.accessories.add(accessory);
    }

    removeAccessory(accessory) {
        this.accessories.remove(accessory);
    }
}

export class AccessoryUI {
    constructor(plugin) {
        this.id = AccessoryUI.id++;
        this.plugin = plugin;

        this.express = express();
        this.scripts = [];

        Object.freeze(this);
    }

    use(...args) {
        return this.express.use(...args);
    }

    static(prefix, path) {
        return this.express.use(prefix, express.static(path));
    }

    get enabled() {
        if (typeof this.plugin.config['accessory-uis'] === 'object' && typeof this.plugin.config['accessory-uis'][this.id] !== 'undefined') {
            return !!this.plugin.config['accessory-uis'][this.id];
        }
        if (typeof this.plugin.config['accessory-uis'] === 'object' && typeof this.plugin.config['accessory-uis']['*'] !== 'undefined') {
            return !!this.plugin.config['accessory-uis']['*'];
        }

        if (typeof this.plugin.config['accessory-uis'] !== 'undefined' && typeof this.plugin.config['accessory-uis'] !== 'object') {
            return !!this.plugin.config['accessory-uis'];
        }

        const defaults = this.plugin.plugin_manager.default_plugin_config || {};

        if (typeof defaults['accessory-uis'] === 'object' && typeof defaults['accessory-uis'][this.id] !== 'undefined') {
            return !!defaults['accessory-uis'][this.id];
        }
        if (typeof defaults['accessory-uis'] === 'object' && typeof defaults['accessory-uis']['*'] !== 'undefined') {
            return !!defaults['accessory-uis']['*'];
        }

        if (typeof defaults['accessory-uis'] !== 'undefined' && typeof defaults['accessory-uis'] !== 'object') {
            return !!defaults['accessory-uis'];
        }

        return true;
    }

    handle(req, res, next) {
        this.express.handle(req, res, next);
    }

    loadScript(path) {
        this.scripts.push(path);
    }
}

AccessoryUI.id = 0;

export class AccessoryDiscovery {
    constructor(plugin) {
        Object.defineProperty(this, 'plugin', {value: plugin});
    }
}

export class AccessorySetup {
    constructor(plugin) {
        Object.defineProperty(this, 'plugin', {value: plugin});
    }
}

export class AuthenticationHandler {
    constructor(plugin, localid, handler, disconnect_handler) {
        Object.defineProperty(this, 'id', {value: AuthenticationHandler.id++});
        Object.defineProperty(this, 'plugin', {value: plugin});
        Object.defineProperty(this, 'localid', {value: localid});

        this.handler = handler;
        this.reconnect_handler = null;
        this.disconnect_handler = disconnect_handler;
    }

    get enabled() {
        if (typeof this.plugin.config['authentication-handlers'] === 'object') {
            if (typeof this.plugin.config['authentication-handlers'][this.localid] !== 'undefined') {
                return !!this.plugin.config['authentication-handlers'][this.localid];
            }
            if (typeof this.plugin.config['authentication-handlers'][this.id] !== 'undefined') {
                return !!this.plugin.config['authentication-handlers'][this.id];
            }
            if (typeof this.plugin.config['authentication-handlers']['*'] !== 'undefined') {
                return !!this.plugin.config['authentication-handlers']['*'];
            }
        } else if (typeof this.plugin.config['authentication-handlers'] !== 'undefined') {
            return !!this.plugin.config['authentication-handlers'];
        }

        const defaults = this.plugin.plugin_manager.default_plugin_config &&
            this.plugin.plugin_manager.default_plugin_config['authentication-handlers'] || {};

        if (typeof defaults === 'object') {
            if (typeof defaults[this.id] !== 'undefined') {
                return !!defaults[this.id];
            }
            if (typeof defaults['*'] !== 'undefined') {
                return !!defaults['*'];
            }
        } else if (typeof defaults !== 'undefined') {
            return !!defaults;
        }

        return true;
    }

    async handleMessage(data) {
        const response = await this.handler.call(this, data);

        if (response instanceof AuthenticatedUser) {
            if (response.authentication_handler && response.authentication_handler !== this) {
                throw new Error('The authentication handler returned an AuthenticatedUser object that belongs to'
                    + ' another authentication handler');
            }

            Object.defineProperty(response, 'authentication_handler', {value: this});
        }

        return response;
    }

    /**
     * @param {string} token
     * @param {Object} data
     * @return {Promise<AuthenticatedUser>}
     */
    handleResumeSession(token, data) {
        if (this.reconnect_handler) return this.reconnect_handler.call(this, data);

        const authenticated_user = new AuthenticatedUser(this.plugin, data.id, data.name, this);
        Object.defineProperty(authenticated_user, 'token', {value: token});

        for (const k of Object.keys(data)) {
            if (!['plugin', 'id', 'name', 'authentication_handler', 'token'].includes(k)) {
                authenticated_user[k] = data[k];
            }
        }

        return authenticated_user;
    }

    handleReauthenticate(authenticated_user) {
        if (!this.disconnect_handler) return;

        return this.disconnect_handler.call(this, authenticated_user, false);
    }

    handleDisconnect(authenticated_user) {
        if (!this.disconnect_handler) return;

        return this.disconnect_handler.call(this, authenticated_user, true);
    }
}

AuthenticationHandler.id = 0;

export class AuthenticatedUser {
    constructor(plugin, id, name, authentication_handler) {
        Object.defineProperty(this, 'plugin', {value: plugin});
        Object.defineProperty(this, 'id', {value: id});

        Object.defineProperty(this, 'authentication_handler',
            authentication_handler && authentication_handler instanceof AuthenticationHandler
                ? {value: authentication_handler} : {configurable: true, value: null});

        Object.defineProperty(this, 'token', {configurable: true, value: null});

        this.name = name;
    }

    async enableReauthentication() {
        const bytes = await new Promise((rs, rj) => crypto.randomBytes(48, (err, bytes) => err ? rj(err) : rs(bytes)));
        const token = bytes.toString('hex');

        Object.defineProperty(this, 'token', {value: token});

        // The server will later save the session
    }
}

export class PluginAPI {
    constructor(plugin, parent_module) {
        this.plugin = plugin;
        this.parent_module = parent_module;

        Object.freeze(this);
    }

    registerAccessory(name, handler) {
        return this.plugin.registerAccessory(name, handler);
    }

    registerAccessoryPlatform(name, handler) {
        return this.plugin.registerAccessoryPlatform(name, handler);
    }

    registerDynamicAccessoryPlatform(name, handler) {
        return this.registerAccessoryPlatform(name, AccessoryPlatform.withDynamicHandler(handler));
    }

    registerAccessoryUI(handler) {
        return this.plugin.registerAccessoryUI(handler);
    }

    registerAccessoryDiscovery(handler) {
        return this.plugin.registerAccessoryDiscovery(handler);
    }

    registerAccessorySetup(name, handler) {
        return this.plugin.registerAccessorySetup(name, handler);
    }

    registerAuthenticationHandler(name, handler, disconnect_handler) {
        return this.plugin.registerAuthenticationHandler(name, handler, disconnect_handler);
    }

    registerAutomationTrigger(name, handler) {
        return this.plugin.registerAutomationTrigger(name, handler);
    }

    registerAutomationCondition(name, handler) {
        return this.plugin.registerAutomationCondition(name, handler);
    }

    registerAutomationAction(name, handler) {
        return this.plugin.registerAutomationAction(name, handler);
    }
}

PluginManager.requirePatch();
