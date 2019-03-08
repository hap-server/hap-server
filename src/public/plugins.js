
import path from 'path';
import axios from 'axios';

import * as vue_module from 'vue';
import * as axios_module from 'axios';

import Service, {type_names as service_type_names, system_types as system_service_types, collapsed_services} from './service';
import Characteristic from './characteristic';

import {instances as main_component_instances} from './components/main-component.vue';
import service_components from './components/services';
import * as service_component_module from './components/services/service.vue';
import accessory_details_components from './components/accessory-details';
import * as accessory_details_component_module from './components/accessory-details/accessory-details.vue';
import icon_component_modules from './components/icons';

let instance;

export class PluginManager {
    constructor() {
        // this.accessory_uis = new Set();
        this.require_caches = new WeakMap();
        this.plugin_apis = new Map();
    }

    static get instance() {
        return instance || (instance = new PluginManager());
    }

    async loadAccessoryUI(accessory_ui) {
        for (const script of accessory_ui.scripts) {
            try {
                await this.loadAccessoryUIScript(accessory_ui, script);
            } catch (err) {
                console.error('Error loading accessory UI script', accessory_ui.id, script, err);
            }
        }
    }

    async loadAccessoryUIScript(accessory_ui, script) {
        if (!script.startsWith('/')) script = '/' + script;

        return this.import(accessory_ui, undefined, this.getModuleCache(accessory_ui), undefined, script);
    }

    require(accessory_ui, script, cache, module, request) {
        if (request === '.' || request === '..' || request.startsWith('./') || request.startsWith('../')) {
            request = path.resolve(path.dirname(script), request);
        }

        if (request === 'hap-server-api/accessory-ui') {
            return this.getPluginAPI(accessory_ui);
        } else if (request === 'hap-server-api/accessory-ui/service') {
            return service_component_module;
        } else if (request === 'hap-server-api/accessory-ui/accessory-details') {
            return accessory_details_component_module;
        } else if (request.startsWith('hap-server-api/accessory-ui/icons/') && icon_component_modules.has('./' + request.substr(34) + '.vue')) {
            return icon_component_modules.get('./' + request.substr(34) + '.vue');
        } else if (request === 'vue') {
            return vue_module;
        } else if (request === 'axios') {
            return axios_module;
        }

        if (cache[request]) {
            return cache[request].exports;
        } else if (cache[request + '.js']) {
            return cache[request + '.js'].exports;
        } else if (cache[request + '/index.js']) {
            return cache[request + '/index.js'].exports;
        }

        throw new Error('Unknown module ' + request);
    }

    async import(accessory_ui, script, cache, parent, request) {
        if (script) request = path.resolve(path.dirname(script), request);

        const js = (await axios.get('./accessory-ui/' + accessory_ui.id + request)).data;

        const wrapper = [
            '(function (exports, require, module, __filename, __dirname) { ',
            '\n})',
        ];

        const module_function = eval(wrapper[0] + js + wrapper[1]);

        const module = {
            exports: {},
            require: undefined,
            import: undefined,
            accessory_ui,
            parent,
        };
        module.require = this.require.bind(this, accessory_ui, request, cache, module);
        module.require.cache = cache;
        module.import = this.import.bind(this, accessory_ui, request, cache, module);
        module.require.import = module.import;

        cache[request] = module;

        try {
            module_function.call(module, module.exports, module.require, module, request, '/');
        } catch (err) {
            delete cache[request];
            throw err;
        }

        return module.exports;
    }

    getModuleCache(accessory_ui) {
        if (this.require_caches.has(accessory_ui)) return this.require_caches.get(accessory_ui);

        const cache = {};

        this.require_caches.set(accessory_ui, cache);

        return cache;
    }

    getPluginAPI(accessory_ui) {
        if (this.plugin_apis.has(accessory_ui)) return this.plugin_apis.get(accessory_ui);

        const plugin_api = new PluginAPI(this, accessory_ui);

        const plugin_api_module = {
            __esModule: true,
            default: plugin_api,

            // Expose Service and Characteristic for the default UUIDs
            Service,
            Characteristic,
        };

        this.plugin_apis.set(accessory_ui, plugin_api_module);

        return plugin_api_module;
    }
}

export default PluginManager.instance;

export class PluginAPI {
    constructor(plugin_manager, accessory_ui) {
        this.plugin_manager = plugin_manager;
        this.accessory_ui = accessory_ui;
    }

    log(...args) {
        console.log('Accessory UI ' + this.accessory_ui.id, ...args);
    }

    refreshDisplayServices() {
        for (const component of main_component_instances) {
            for (const accessory of Object.values(component.accessories)) {
                accessory.refreshDisplayServices();
            }
        }
    }

    registerServiceComponent(type, component) {
        if (service_components.has(type)) {
            throw new Error('There is already a service component with the type "' + type + '"');
        }

        if (!component.name) {
            component.name = service_type_names[type] || 'service-' + type;
        }

        service_components.set(type, component);

        this.refreshDisplayServices();
    }

    registerAccessoryDetailsComponent(type, component) {
        if (accessory_details_components.has(type)) {
            throw new Error('There is already an accessory details component with the type "' + type + '"');
        }

        if (!component.name) {
            component.name = service_type_names[type] || 'accessory-details-' + type;
        }

        accessory_details_components.set(type, component);

        this.refreshDisplayServices();
    }

    registerSystemServiceType(type) {
        // Why do we need this?

        if (system_service_types.includes(type)) return;

        system_service_types.push(type);

        this.refreshDisplayServices();
    }

    registerCollapsedService(uuid, collapsed_service_types) {
        if (collapsed_services[uuid]) {
            throw new Error('There is already a collapsed service with the UUID "' + uuid + '"');
        }

        if (!collapsed_service_types instanceof Array) {
            throw new Error('collapsed_services must be an Array');
        }

        for (const collapsed_service_type of collapsed_service_types) {
            for (const registered_collapsed_service of collapsed_services) {
                if (registered_collapsed_service.includes(collapsed_service_type)) {
                    throw new Error('The service type "' + collapsed_service_type + '" is already used in another' +
                        ' collapsed service');
                }
            }
        }

        collapsed_services[uuid] = collapsed_service_types;

        this.refreshDisplayServices();
    }
}
