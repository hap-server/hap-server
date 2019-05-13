
import path from 'path';
import axios from 'axios';

import * as vue_module from 'vue';
import * as axios_module from 'axios';

import Service, {
    type_names as service_type_names,
    system_types as system_service_types,
    collapsed_services,
} from './service';
import Characteristic from './characteristic';

import {AuthenticationHandlerConnection, AuthenticatedUser} from '../common/connection';

import {instances as main_component_instances} from './components/main-component.vue';
import service_components from './components/services';
import * as service_component_module from './components/services/service.vue';
import accessory_details_components from './components/accessory-details';
import * as accessory_details_component_module from './components/accessory-details/accessory-details.vue';
import icon_component_modules from './components/icons';
import authentication_handler_components from './components/authentication-handlers';
import layout_section_components from './components/layout-sections';
import * as layout_section_component_module from './components/layout-section.vue';
import * as sortable_component_module from './components/sortable.vue';
import * as vue_color_chrome_module from 'vue-color/src/components/Chrome.vue';
import * as vue_color_swatches_module from 'vue-color/src/components/Swatches.vue';
import * as vue_color_sketch_module from 'vue-color/src/components/Sketch.vue';

import {
    trigger_components as automation_trigger_components,
    condition_components as automation_condition_components,
    action_components as automation_action_components,
} from './automations';

let automation_trigger_component_module;
let automation_condition_component_module;
let automation_action_component_module;
let vuedraggable_module;
let codemirror_module;
let vue_codemirror_module;

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

    /**
     * Get the exports of an accessory UI script.
     *
     * @param {AccessoryUI} accessory_ui
     * @param {?string} script The parent module's name
     * @param {Object} cache The module cache
     * @param {?Object} module The parent module
     * @param {string} request The name of the module to return the exports of
     * @return {}
     */
    require(accessory_ui, script, cache, module, request) {
        if (request === '.' || request === '..' || request.startsWith('./') || request.startsWith('../')) {
            request = path.resolve(path.dirname(script), request);
        }

        if (request === '@hap-server/accessory-ui-api') {
            return this.getPluginAPI(accessory_ui);
        } else if (request === '@hap-server/accessory-ui-api/service') {
            return service_component_module;
        } else if (request === '@hap-server/accessory-ui-api/accessory-details') {
            return accessory_details_component_module;
        } else if (request === '@hap-server/accessory-ui-api/layout-section') {
            return layout_section_component_module;
        } else if (request === '@hap-server/accessory-ui-api/sortable') {
            return sortable_component_module;
        } else if (request.startsWith('@hap-server/accessory-ui-api/icons/') &&
            icon_component_modules.has('./' + request.substr(35) + '.vue')
        ) {
            return icon_component_modules.get('./' + request.substr(35) + '.vue');
        } else if (request === 'vue') {
            return vue_module;
        } else if (request === 'axios') {
            return axios_module;
        } else if (request === 'vue-color/chrome') {
            return vue_color_chrome_module;
        } else if (request === 'vue-color/swatches') {
            return vue_color_swatches_module;
        } else if (request === 'vue-color/sketch') {
            return vue_color_sketch_module;
        }

        if (request === '@hap-server/accessory-ui-api/automation-trigger' && automation_trigger_component_module) {
            return automation_trigger_component_module;
        } else if (request === '@hap-server/accessory-ui-api/automation-condition' &&
            automation_condition_component_module
        ) {
            return automation_condition_component_module;
        } else if (request === '@hap-server/accessory-ui-api/automation-action' && automation_action_component_module) {
            return automation_action_component_module;
        } else if (request === 'vuedraggable' && vuedraggable_module) {
            return vuedraggable_module;
        } else if (request === 'codemirror' && codemirror_module) {
            return codemirror_module;
        } else if (request === 'vue-codemirror' && vue_codemirror_module) {
            return vue_codemirror_module;
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

    /**
     * Imports an accessory UI script.
     *
     * @param {AccessoryUI} accessory_ui
     * @param {?string} script The parent module's name
     * @param {Object} cache The module cache
     * @param {?Object} module The parent module
     * @param {string} request The name of the module to return the exports of
     * @return {Promise<>}
     */
    async import(accessory_ui, script, cache, parent, request) {
        if (script) request = path.resolve(path.dirname(script), request);

        if (cache[request]) {
            return cache[request].exports;
        }

        if (request === '@hap-server/accessory-ui-api/automation-trigger') {
            return import(/* webpackChunkName: 'automations' */ './automations/trigger.vue')
                .then(m => automation_trigger_component_module = m);
        } else if (request === '@hap-server/accessory-ui-api/automation-condition') {
            return import(/* webpackChunkName: 'automations' */ './automations/condition.vue')
                .then(m => automation_condition_component_module = m);
        } else if (request === '@hap-server/accessory-ui-api/automation-action') {
            return import(/* webpackChunkName: 'automations' */ './automations/action.vue')
                .then(m => automation_action_component_module = m);
        } else if (request === 'vuedraggable') {
            return import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable').then(m => vuedraggable_module = m);
        } else if (request === 'codemirror') {
            return import(/* webpackChunkName: 'codemirror' */ 'codemirror').then(m => codemirror_module = m);
        } else if (request === 'vue-codemirror') {
            return import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror').then(m => vue_codemirror_module = m);
        }

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

    /**
     * Get the module cache for an accessory UI.
     *
     * @param {AccessoryUI} accessory_ui
     * @return {Object}
     */
    getModuleCache(accessory_ui) {
        if (this.require_caches.has(accessory_ui)) return this.require_caches.get(accessory_ui);

        const cache = {};

        this.require_caches.set(accessory_ui, cache);

        return cache;
    }

    /**
     * Get the plugin API module for an accessory UI.
     *
     * @param {AccessoryUI} accessory_ui
     * @return {Object}
     */
    getPluginAPI(accessory_ui) {
        if (this.plugin_apis.has(accessory_ui)) return this.plugin_apis.get(accessory_ui);

        const plugin_api = new PluginAPI(this, accessory_ui);

        const plugin_api_module = {
            __esModule: true,
            default: plugin_api,

            AuthenticationHandlerConnection,
            AuthenticatedUser,

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
        Object.defineProperty(this, 'plugin_manager', {value: plugin_manager});
        Object.defineProperty(this, 'accessory_ui', {value: accessory_ui});
    }

    log(...args) {
        console.log('Accessory UI ' + this.accessory_ui.id, ...args);
    }

    /**
     * Refreshes display services of existing accessories.
     * This is automatically called when registering any component that affects display services, so you don't need to
     * use this directly.
     */
    refreshDisplayServices() {
        for (const component of main_component_instances) {
            for (const accessory of Object.values(component.accessories)) {
                accessory.refreshDisplayServices();
            }
        }
    }

    /**
     * Registers a service component (the small tile).
     *
     * @param {string} type The service type UUID
     * @param {VueComponent} component
     */
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

    /**
     * Registers an accessory details component (the full screen view).
     *
     * @param {string} type The service type UUID
     * @param {VueComponent} component
     */
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

    /**
     * Collapse multiple services into a single display service.
     *
     * @param {string} type The service type UUID to use for the display service
     * @param {string[]} collapsed_service_types An array of service type UUIDs to collapse
     */
    registerCollapsedService(uuid, collapsed_service_types) {
        if (collapsed_services[uuid]) {
            throw new Error('There is already a collapsed service with the UUID "' + uuid + '"');
        }

        if (!(collapsed_service_types instanceof Array)) {
            throw new Error('collapsed_service_types must be an Array');
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

    /**
     * Registers an authentication handler component.
     *
     * @param {string} localid The authentication handler ID
     * @param {VueComponent} component
     * @param {string} name A display name for the authentication handler (used when multiple authentication handlers are available)
     */
    registerAuthenticationHandlerComponent(localid, component, name) {
        const id = this.accessory_ui.plugin_authentication_handlers[localid];

        if (typeof id === 'undefined') {
            throw new Error('Unknown authentication handler "' + localid + '"');
        }

        if (authentication_handler_components.has(id)) {
            throw new Error('There is already an authentication handler component with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!name) name = localid;

        if (!component.name) {
            component.name = 'authentication-handler-' + localid;
        }

        authentication_handler_components.set(id, {component, name});
    }

    /**
     * Registers a layout section component.
     *
     * @param {string} type The section type ID
     * @param {VueComponent} component
     * @param {string} name A display name for the authentication handler
     */
    registerLayoutSectionComponent(type, component, name) {
        if (layout_section_components.has(type)) {
            throw new Error('There is already a layout section component with the ID "' + type + '"');
        }

        if (!component.name) {
            component.name = 'layout-section-' + type;
        }

        layout_section_components.set(type, {component, name});
    }

    /**
     * Registers an automation trigger editor component.
     *
     * @param {string} type
     * @param {VueComponent} component
     * @param {string} name A display name for the automation trigger
     * @param {string} [plugin] The name of the plugin that registered the automation trigger
     */
    registerAutomationTriggerComponent(type, component, name, plugin) {
        if (!plugin) plugin = this.plugin;
        if (!plugin) throw new Error('Unknown plugin');

        if (automation_trigger_components.find(c => c.plugin === plugin && c.type === type)) {
            throw new Error('There is already an automation trigger component with the ID "' + type +
                '" for the plugin "' + plugin + '"');
        }

        if (!name) name = type + ' (' + plugin + ')';

        if (!component.name) component.name = 'automation-trigger-' + plugin + '-' + type;

        automation_trigger_components.push({component, plugin, type, name});
    }

    /**
     * Registers an automation condition editor component.
     *
     * @param {string} type
     * @param {VueComponent} component
     * @param {string} name A display name for the automation condition
     * @param {string} [plugin] The name of the plugin that registered the automation condition
     */
    registerAutomationConditionComponent(type, component, name, plugin) {
        if (!plugin) plugin = this.plugin;
        if (!plugin) throw new Error('Unknown plugin');

        if (automation_condition_components.find(c => c.plugin === plugin && c.type === type)) {
            throw new Error('There is already an automation condition component with the ID "' + type +
                '" for the plugin "' + plugin + '"');
        }

        if (!name) name = type + ' (' + plugin + ')';

        if (!component.name) component.name = 'automation-condition-' + plugin + '-' + type;

        automation_condition_components.push({component, plugin, type, name});
    }

    /**
     * Registers an automation action editor component.
     *
     * @param {string} type
     * @param {VueComponent} component
     * @param {string} name A display name for the automation action
     * @param {string} [plugin] The name of the plugin that registered the automation action
     */
    registerAutomationActionComponent(type, component, name, plugin) {
        if (!plugin) plugin = this.accessory_ui.plugin;
        if (!plugin) throw new Error('Unknown plugin');

        if (automation_action_components.find(c => c.plugin === plugin && c.type === type)) {
            throw new Error('There is already an automation action component with the ID "' + type +
                '" for the plugin "' + plugin + '"');
        }

        if (!name) name = type + ' (' + plugin + ')';

        if (!component.name) component.name = 'automation-action-' + plugin + '-' + type;

        automation_action_components.push({component, plugin, type, name});
    }
}
