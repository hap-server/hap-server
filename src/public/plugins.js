
import path from 'path';
import url from 'url';
import axios from 'axios';

import * as vue_module from 'vue';
import * as axios_module from 'axios';

import Service, {
    type_names as service_type_names,
    system_types as system_service_types,
    collapsed_services,
} from '../client/service';
import Characteristic from '../client/characteristic';

import {
    AuthenticationHandlerConnection, AuthenticatedUser,
    UserManagementConnection, UserManagementUser,
    AccessorySetupConnection,
} from '../client/connection';

import * as sortable_component_module from './components/sortable.vue';
import * as panel_tabs_component_module from './components/panel-tabs.vue';
import * as dropdown_component_module from './components/dropdown.vue';
import * as vue_mixins from './mixins';

import {instances as main_component_instances} from './components/main-component.vue';
import service_components from './components/services';
import * as service_component_module from './components/services/service.vue';
import accessory_details_components from './components/accessory-details';
import * as accessory_details_component_module from './components/accessory-details/accessory-details.vue';
import icon_component_modules from './components/icons';
import authentication_handler_components from './components/authentication-handlers';
import layout_section_components from './components/layout-sections';
import * as layout_section_component_module from './components/layout-section.vue';
import accessory_discovery_components from './components/accessory-discovery';
import * as accessory_discovery_component_module from './components/accessory-discovery/accessory-discovery.vue';
import accessory_setup_components from './components/accessory-setup';
import user_management_handlers from './components/user-management';
import accessory_settings_components from './components/accessory-settings';

import * as vue_color_chrome_module from 'vue-color/src/components/Chrome.vue';
import * as vue_color_swatches_module from 'vue-color/src/components/Swatches.vue';
import * as vue_color_sketch_module from 'vue-color/src/components/Sketch.vue';
import {DiscoveredAccessory} from './components/add-accessory.vue';

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
        this.base_url = '';
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
     * @param {object} cache The module cache
     * @param {?object} module The parent module
     * @param {string} request The name of the module to return the exports of
     * @return {*}
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
        } else if (request === '@hap-server/accessory-ui-api/accessory-discovery') {
            return accessory_discovery_component_module;
        } else if (request === '@hap-server/accessory-ui-api/sortable') {
            return sortable_component_module;
        } else if (request === '@hap-server/accessory-ui-api/panel-tabs') {
            return panel_tabs_component_module;
        } else if (request === '@hap-server/accessory-ui-api/dropdown') {
            return dropdown_component_module;
        } else if (request.startsWith('@hap-server/accessory-ui-api/icons/') &&
            icon_component_modules.has('./' + request.substr(35) + '.vue')
        ) {
            return icon_component_modules.get('./' + request.substr(35) + '.vue');
        } else if (request === '@hap-server/accessory-ui-api/mixins') {
            return vue_mixins;
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
     * @param {object} cache The module cache
     * @param {?object} parent The parent module
     * @param {string} request The name of the module to return the exports of
     * @return {Promise<*>}
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

        const relative_url = 'accessory-ui/' + accessory_ui.id + request;
        const request_url = this.base_url ? url.resolve(this.base_url, relative_url) : relative_url;
        const js = (await axios.get(request_url)).data;

        const wrapper = [
            '(function (exports, require, module, __filename, __dirname) { ',
            '\n})',
        ];

        const module_function = eval(wrapper[0] + js + wrapper[1]);

        const module = {
            url: request_url,
            relative_url,
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
     * @return {object}
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
     * @return {object}
     */
    getPluginAPI(accessory_ui) {
        if (this.plugin_apis.has(accessory_ui)) return this.plugin_apis.get(accessory_ui);

        const plugin_api = new PluginAPI(this, accessory_ui);

        const plugin_api_module = {
            __esModule: true,
            default: plugin_api,

            AuthenticationHandlerConnection,
            AuthenticatedUser,

            UserManagementHandler: class extends UserManagementHandler {
                constructor(...args) {
                    super(accessory_ui, ...args);
                }
            },
            UserManagementConnection,
            UserManagementUser,

            AccessorySetupConnection,
            DiscoveredAccessory,

            // Expose Service and Characteristic for Vue prop type checking and the default UUIDs
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
    registerCollapsedService(type, collapsed_service_types) {
        if (collapsed_services[type]) {
            throw new Error('There is already a collapsed service with the UUID "' + type + '"');
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

        collapsed_services[type] = collapsed_service_types;

        this.refreshDisplayServices();
    }

    /**
     * Registers an accessory discovery component.
     *
     * @param {string} localid
     * @param {VueComponent} component
     */
    registerAccessoryDiscoveryComponent(localid, component) {
        const id = this.accessory_ui.plugin_accessory_discovery_handlers[localid];
        const setup_handler = this.accessory_ui.plugin_accessory_discovery_handler_setup_handlers[localid];

        if (typeof id === 'undefined') {
            throw new Error('Unknown accessory discovery handler "' + localid + '"');
        }
        if (typeof setup_handler === 'undefined') {
            throw new Error('Unknown accessory setup handler for accessory discovery handler "' + localid + '"');
        }

        if (accessory_discovery_components.has(id)) {
            throw new Error('There is already an accessory discovery component with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!name) name = localid;

        if (!component.name) {
            component.name = 'accessory-discovery-' + localid;
        }

        accessory_discovery_components.set(id, {component, setup_handler});
    }

    /**
     * Registers an accessory setup component.
     *
     * @param {string} localid
     * @param {VueComponent} component
     * @param {object} [options]
     * @param {string} [options.name]
     * @param {boolean} [options.manual]
     */
    registerAccessorySetupComponent(localid, component, options) {
        const id = this.accessory_ui.plugin_accessory_setup_handlers[localid];
        const name = options && options.name || localid;
        const manual = options && options.manual || false;

        if (typeof id === 'undefined') {
            throw new Error('Unknown accessory setup handler "' + localid + '"');
        }

        if (accessory_setup_components.has(id)) {
            throw new Error('There is already an accessory setup component with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!component.name) {
            component.name = 'accessory-setup-' + localid;
        }

        accessory_setup_components.set(id, {component, name, manual});
    }

    /**
     * Registers an accessory settings component.
     *
     * @param {string} type The service type UUID
     * @param {VueComponent} component
     */
    registerAccessorySettingsComponent(type, component) {
        if (accessory_settings_components.has(type)) {
            throw new Error('There is already an accessory settings component with the type "' + type + '"');
        }

        if (!component.name) {
            component.name = service_type_names[type] || 'accessory-settings-' + type;
        }

        accessory_settings_components.set(type, component);
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
     * Registers a user management handler.
     *
     * @param {string} localid
     * @param {function} handler A class that extends UserManagementHandler
     * @param {string} [name]
     */
    registerUserManagementHandler(localid, handler, name) {
        const id = this.accessory_ui.plugin_user_management_handlers[localid];

        if (typeof id === 'undefined') {
            throw new Error('Unknown user management handler "' + localid + '"');
        }

        if (user_management_handlers.has(id)) {
            throw new Error('There is already a user management handler with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!(handler.prototype instanceof UserManagementHandler)) {
            throw new Error('handler must be a class that extends UserManagementHandler');
        }

        if (name || !handler.name) Object.defineProperty(handler, 'name', {configurable: true, value: name || localid});

        Object.defineProperty(handler, 'user_management_handler_id', {value: id});
        Object.defineProperty(handler, 'user_management_handler_localid', {value: localid});

        user_management_handlers.set(id, handler);
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

export class UserManagementHandler {
    constructor(accessory_ui, /* id, */ connection) {
        Object.defineProperty(this, 'id', {value: UserManagementHandler.id++});
        Object.defineProperty(this, 'accessory_ui', {value: accessory_ui});
        Object.defineProperty(this, 'connection', {value: new UserManagementConnection(connection, this.user_management_handler_id)});
    }

    get user_management_handler_id() {
        return this.constructor.user_management_handler_id;
    }
    get user_management_handler_localid() {
        return this.constructor.user_management_handler_localid;
    }

    static get component() {
        throw new Error('The user management handler didn\'t set the component property');
    }
    static set component(value) {
        Object.defineProperty(this, 'component', {writable: true, value});
    }

    async getUsers() {
        throw new Error('The user management handler didn\'t override the getUsers method');
    }
}

UserManagementHandler.id = 0;
