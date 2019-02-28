
import Module from 'module';
import fs from 'fs';
import path from 'path';
import util from 'util';

import semver from 'semver';
import persist from 'node-persist';
import hap from 'hap-nodejs';
import * as HapAsync from './hap-async';

import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';

import Logger from './logger';

import {version as hap_server_version} from '../../package';

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

        Module._load = function (request, parent, isMain) {
            if (request === 'hap-server-api' || request.startsWith('hap-server-api/')) {
                const plugin = PluginManager.instance.getPluginByModule(parent);

                if (plugin) {
                    const module = PluginManager.requireApi(request, plugin, parent);

                    if (module) return module;
                }
            }

            return module_load.apply(this, arguments);
        };
    }

    getPluginByModule(module) {
        return this.plugins.find(plugin => module.filename === plugin.path || module.filename.startsWith(plugin.path + path.sep));
    }

    static requireApi(request, plugin, parent) {
        if (request === 'hap-server-api') {
            let plugin_api = PluginManager.instance.plugin_apis.get(plugin);

            if (!plugin_api) PluginManager.instance.plugin_apis.set(plugin, plugin_api = Object.freeze({
                __esModule: true,
                plugin,
                parent_module: parent,
                default: new PluginAPI(plugin, parent),
                log: new Logger(plugin.name),
                AccessoryPlatform,
                AccessoryUI,
                AccessoryDiscovery,
                AccessorySetup,
            }));

            return plugin_api;
        } else if (request === 'hap-server-api/hap') {
            return hap;
        } else if (request === 'hap-server-api/hap-async') {
            return HapAsync;
        } else if (request === 'hap-server-api/storage') {
            if (!plugin.name) {
                throw new Error('Storage is only available for plugins with a name');
            }

            let plugin_storage = PluginManager.instance.plugin_storage.get(plugin.name);

            if (!plugin_storage) PluginManager.instance.plugin_storage.set(plugin.name, plugin_storage = Object.freeze({
                __esModule: true,
                default: persist.create({
                    dir: path.resolve(PluginManager.instance.storage_path, plugin.name),
                    stringify: data => (JSON.stringify(data, null, 4) + '\n'),
                }),
            }));

            return plugin_storage;
        }

        log.warn(plugin.name, 'tried to load an unknown virtual hap-server-api/* module');
    }

    getPlugin(plugin_name) {
        return this.plugins.find(plugin => plugin.name === plugin_name || plugin.path === plugin_name);
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

            if (!package_json.engines || !package_json.engines['hap-server'] ||
                !package_json.keywords || !package_json.keywords.includes('hap-server-plugin')) {
                throw new Error('"' + package_json.name + '" is not a hap-server plugin');
            }

            if (!semver.satisfies(hap_server_version, package_json.engines['hap-server'])) {
                throw new Error('"' + package_json.name + '" requires a hap-server version of '
                    + package_json.engines['hap-server'] + ' - you have version ' + hap_server_version);
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
            require(plugin_path);

            // If the plugin requires storage, initialise it now
            const plugin_storage = PluginManager.instance.plugin_storage.get(plugin.name);

            if (plugin_storage) {
                log.info('Initialising plugin storage for', plugin.name);
                await plugin_storage.default.init();
            }
        } catch (err) {
            log.error('Error loading plugin', name, err);
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

    async _loadPlugin(plugin_path) {
        try {
            const stat = await fs_stat(plugin_path);

            if (stat.isFile()) {
                return this.loadPlugin(plugin_path);
            }
        } catch (err) {
            return;
        }

        try {
            const package_stat = await fs_stat(path.join(plugin_path, 'package.json'));

            return this.loadPlugin(plugin_path);
        } catch (err) {}

        return Promise.all((await fs_readdir(plugin_path)).map(async dir => {
            const plugin_dir = path.join(plugin_path, dir);
            const stat = await fs_stat(plugin_dir);
            if (!stat.isDirectory()) return log.error(plugin_dir, 'is not a directory');

            try {
                await this.loadPlugin(plugin_dir);
            } catch (err) {}
        }));
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
    }

    getAccessoryHandler(name) {
        return this.accessories.get(name);
    }

    registerAccessory(name, handler) {
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
        if (name instanceof AccessoryPlatform && !handler) {
            handler = name;
            name = handler.name;
        }

        if (this.accessory_platforms.has(name)) {
            throw new Error(this.name + ' has already registered an accessory platform with the name "' + name + '".');
        }

        if (!handler instanceof AccessoryPlatform) {
            handler = AccessoryPlatform.withHandler(handler);
        }

        log.info('Registering accessory platform', name, 'from plugin', this.name);

        this.accessory_platforms.set(name, handler);

        return handler;
    }

    getAccessoryUIs() {
        return [...this.accessory_ui];
    }

    registerAccessoryUI(handler) {
        if (!handler instanceof AccessoryUI) {
            throw new Error('handler must be an AccessoryUI object');
        }

        log.info('Registering accessory UI from plugin', this.name);

        this.accessory_ui.add(handler);
    }

    getAccessoryDiscoveryHandlers() {
        return [...this.accessory_discovery];
    }

    registerAccessoryDiscovery(handler) {
        if (!handler instanceof AccessoryDiscovery) {
            throw new Error('handler must be an AccessoryDiscovery object');
        }

        log.info('Registering accessory discovery handler from plugin', this.name);

        this.accessory_discovery.add(handler);
    }

    getAccessorySetupHandlers() {
        return [...this.accessory_setup.keys()];
    }

    getAccessorySetupHandler(name) {
        return this.accessory_setup.get(name);
    }

    registerAccessorySetup(name, handler) {
        if (name instanceof AccessorySetup.prototype && !handler) {
            handler = name;
            name = handler.name;
        }

        if (!handler instanceof AccessorySetup.prototype) {
            throw new Error('handler must be a class that extends AccessorySetup');
        }

        if (this.accessory_setup.has(name)) {
            throw new Error(this.name + ' has already registered an accessory platform with the name "' + name + '".');
        }

        log.info('Registering accessory setup handler', name, 'from plugin', this.name);

        this.accessory_setup.set(name, handler);
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
                const accessories = await handler.call(this, this.config, cached_accessories);

                this.accessories = accessories;
            }
        };
    }

    static withDynamicHandler(handler) {
        return class extends AccessoryPlatform {
            async init(cached_accessories) {
                const accessories = await handler.call(this, this, this.config, cached_accessories);

                this.accessories = accessories;
            }
        };
    }

    async init(cached_accessories) {
        for (let cached_accessory of cached_accessories) {
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

}

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
}

PluginManager.requirePatch();
