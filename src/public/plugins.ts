
import path from 'path';
import url from 'url';
import axios from 'axios';

import * as vue_module from 'vue';
import * as axios_module from 'axios';

import Accessory from '../client/accessory';
import Service, {
    type_names as service_type_names,
    system_types as system_service_types,
    collapsed_services,
} from '../client/service';
import Characteristic from '../client/characteristic';

import Connection, {
    AuthenticationHandlerConnection, AuthenticatedUser,
    UserManagementConnection, UserManagementUser,
    AccessorySetupConnection,
} from '../client/connection';

import Vue, {Component} from 'vue';

// @ts-ignore
import * as sortable_component_module from './components/sortable.vue';
// @ts-ignore
import * as panel_tabs_component_module from './components/panel-tabs.vue';
// @ts-ignore
import * as dropdown_component_module from './components/dropdown.vue';
import * as vue_mixins from './mixins';

// @ts-ignore
import {instances as main_component_instances} from './components/main-component.vue';
import {
    ServiceTileComponents,
    ServiceDetailsComponents,
    ServiceSettingsComponents,
    LayoutSectionComponents,
    AccessoryDiscoveryComponents,
    AccessorySetupComponents,
    AuthenticationHandlerComponents,
    UserManagementHandlers,
    AutomationTriggerComponents,
    AutomationConditionComponents,
    AutomationActionComponents,
} from './component-registry';
// @ts-ignore
import * as service_component_module from './components/services/service.vue';
// @ts-ignore
import * as accessory_details_component_module from './components/accessory-details/accessory-details.vue';
// @ts-ignore
import icon_component_modules from './components/icons';
// @ts-ignore
import * as layout_section_component_module from './components/layout-section.vue';
// @ts-ignore
import * as accessory_discovery_component_module from './components/accessory-discovery/accessory-discovery.vue';

// @ts-ignore
import * as vue_color_chrome_module from 'vue-color/src/components/Chrome.vue';
// @ts-ignore
import * as vue_color_swatches_module from 'vue-color/src/components/Swatches.vue';
// @ts-ignore
import * as vue_color_sketch_module from 'vue-color/src/components/Sketch.vue';
// @ts-ignore
import {DiscoveredAccessory} from './components/add-accessory.vue';

let automation_trigger_component_module;
let automation_condition_component_module;
let automation_action_component_module;
let vuedraggable_module;
let codemirror_module;
let vue_codemirror_module;

let instance;

export interface UIPlugin {
    id: number;
    /** The plugin that registered the UI plugin */
    plugin: string;
    scripts: string[];
    plugin_accessory_discovery_handlers: {[key: string]: number}; // Maps names to IDs
    plugin_accessory_discovery_handler_setup_handlers: {[key: string]: number};
    plugin_accessory_setup_handlers: {[key: string]: number};
    plugin_authentication_handlers: {[key: string]: number};
    plugin_user_management_handlers: {[key: string]: number};
}

interface Module {
    readonly url: string;
    readonly relative_url: string;
    exports: any;
    readonly ui_plugin: UIPlugin;
    readonly parent?: Module;
    require: {
        (request: string): any;
        cache: RequireCache;
        import(request: string): Promise<any>;
    };
    import(request: string): Promise<any>;

    // Deprecated
    accessory_ui;
}
interface RequireCache {
    [key: string]: Module;
}

export class PluginManager {
    private readonly require_caches = new WeakMap<UIPlugin, {[key: string]: Module}>();
    private readonly plugin_apis = new Map();
    base_url = '';

    static get instance() {
        return instance || (instance = new PluginManager());
    }

    async loadWebInterfacePlugin(ui_plugin: UIPlugin) {
        for (const script of ui_plugin.scripts) {
            try {
                await this.loadWebInterfacePluginScript(ui_plugin, script);
            } catch (err) {
                console.error('Error loading web interface plugin script', ui_plugin.id, script, err);
            }
        }
    }

    async loadAccessoryUI(ui_plugin) {
        return this.loadWebInterfacePlugin(ui_plugin);
    }

    async loadWebInterfacePluginScript(ui_plugin: UIPlugin, script: string) {
        if (!script.startsWith('/')) script = '/' + script;

        return this.import(ui_plugin, undefined, this.getModuleCache(ui_plugin), undefined, script);
    }

    /**
     * Get the exports of an accessory UI script.
     *
     * @param {AccessoryUI} ui_plugin
     * @param {?string} script The parent module's name
     * @param {object} cache The module cache
     * @param {?object} module The parent module
     * @param {string} request The name of the module to return the exports of
     * @return {*}
     */
    require(ui_plugin: UIPlugin, script: string, cache: RequireCache, module: Module, request: string) {
        if (request === '.' || request === '..' || request.startsWith('./') || request.startsWith('../')) {
            request = path.resolve(path.dirname(script), request);
        }

        if (request.match(/^@hap-server\/accessory-ui-api(\/.*)?$/)) {
            console.warn('Using deprecated @hap-server/accessory-ui-api module');
            request = '@hap-server/ui-api' + request.substr(28);
        }

        if (request === '@hap-server/ui-api') {
            return this.getPluginAPI(ui_plugin);
        } else if (request === '@hap-server/ui-api/service') {
            return service_component_module;
        } else if (request === '@hap-server/ui-api/accessory-details') {
            return accessory_details_component_module;
        } else if (request === '@hap-server/ui-api/layout-section') {
            return layout_section_component_module;
        } else if (request === '@hap-server/ui-api/accessory-discovery') {
            return accessory_discovery_component_module;
        } else if (request === '@hap-server/ui-api/sortable') {
            return sortable_component_module;
        } else if (request === '@hap-server/ui-api/panel-tabs') {
            return panel_tabs_component_module;
        } else if (request === '@hap-server/ui-api/dropdown') {
            return dropdown_component_module;
        } else if (request.startsWith('@hap-server/ui-api/icons/') &&
            icon_component_modules.has('./' + request.substr(25) + '.vue')
        ) {
            return icon_component_modules.get('./' + request.substr(25) + '.vue');
        } else if (request === '@hap-server/ui-api/mixins') {
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

        if (request === '@hap-server/ui-api/automation-trigger' && automation_trigger_component_module) {
            return automation_trigger_component_module;
        } else if (request === '@hap-server/ui-api/automation-condition' &&
            automation_condition_component_module
        ) {
            return automation_condition_component_module;
        } else if (request === '@hap-server/ui-api/automation-action' && automation_action_component_module) {
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
     * @param {AccessoryUI} ui_plugin
     * @param {?string} script The parent module's name
     * @param {object} cache The module cache
     * @param {?object} parent The parent module
     * @param {string} request The name of the module to return the exports of
     * @return {Promise<*>}
     */
    async import(ui_plugin: UIPlugin, script: string, cache: RequireCache, parent: Module, request: string) {
        if (script) request = path.resolve(path.dirname(script), request);

        if (request.match(/^@hap-server\/accessory-ui-api(\/.*)?$/)) {
            console.warn('Using deprecated @hap-server/accessory-ui-api module');
            request = '@hap-server/ui-api' + request.substr(28);
        }

        if (cache[request]) {
            return cache[request].exports;
        }

        if (request === '@hap-server/ui-api/automation-trigger') {
            // @ts-ignore
            return import(/* webpackChunkName: 'automations' */ './automations/trigger.vue')
                .then(m => automation_trigger_component_module = m);
        } else if (request === '@hap-server/ui-api/automation-condition') {
            // @ts-ignore
            return import(/* webpackChunkName: 'automations' */ './automations/condition.vue')
                .then(m => automation_condition_component_module = m);
        } else if (request === '@hap-server/ui-api/automation-action') {
            // @ts-ignore
            return import(/* webpackChunkName: 'automations' */ './automations/action.vue')
                .then(m => automation_action_component_module = m);
        } else if (request === 'vuedraggable') {
            return import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable').then(m => vuedraggable_module = m);
        } else if (request === 'codemirror') {
            return import(/* webpackChunkName: 'codemirror' */ 'codemirror').then(m => codemirror_module = m);
        } else if (request === 'vue-codemirror') {
            return import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror').then(m => vue_codemirror_module = m);
        }

        const relative_url = 'ui-plugin/' + ui_plugin.id + request;
        const request_url = this.base_url ? url.resolve(this.base_url, relative_url) : relative_url;
        const js = (await axios.get(request_url)).data;

        const wrapper = [
            '(function (exports, require, module, __filename, __dirname) { ',
            '\n})',
        ];

        const module_function: (
            exports: any,
            require: (request: string) => any,
            module: Module,
            __filename: string,
            __dirname: string
        ) => any = eval(wrapper[0] + js + wrapper[1]);

        const module: Module = {
            url: request_url,
            relative_url,
            exports: {},
            require: undefined,
            import: undefined,
            ui_plugin,
            accessory_ui: ui_plugin,
            parent,
        };
        module.require = this.require.bind(this, ui_plugin, request, cache, module);
        module.require.cache = cache;
        module.import = this.import.bind(this, ui_plugin, request, cache, module);
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
     * @param {AccessoryUI} ui_plugin
     * @return {object}
     */
    getModuleCache(ui_plugin: UIPlugin) {
        if (this.require_caches.has(ui_plugin)) return this.require_caches.get(ui_plugin);

        const cache = {};

        this.require_caches.set(ui_plugin, cache);

        return cache;
    }

    /**
     * Get the plugin API module for an accessory UI.
     *
     * @param {AccessoryUI} ui_plugin
     * @return {object}
     */
    getPluginAPI(ui_plugin: UIPlugin) {
        if (this.plugin_apis.has(ui_plugin)) return this.plugin_apis.get(ui_plugin);

        const plugin_api = new PluginAPI(this, ui_plugin);

        const plugin_api_module = {
            __esModule: true,
            default: plugin_api,

            AuthenticationHandlerConnection,
            AuthenticatedUser,

            UserManagementHandler: class extends UserManagementHandler {
                constructor(/* id, */ connection) {
                    super(ui_plugin /* , id */, connection);
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

        this.plugin_apis.set(ui_plugin, plugin_api_module);

        return plugin_api_module;
    }
}

export default PluginManager.instance;

export class PluginAPI {
    readonly plugin_manager: PluginManager;
    readonly ui_plugin: UIPlugin;

    constructor(plugin_manager: PluginManager, ui_plugin: UIPlugin) {
        Object.defineProperty(this, 'plugin_manager', {value: plugin_manager});
        Object.defineProperty(this, 'ui_plugin', {value: ui_plugin});
    }

    get accessory_ui() {
        return this.ui_plugin;
    }

    log(...args) {
        console.log('UI plugin ' + this.ui_plugin.id, ...args);
    }

    /**
     * Refreshes display services of existing accessories.
     * This is automatically called when registering any component that affects display services, so you don't need to
     * use this directly.
     */
    refreshDisplayServices() {
        for (const component of main_component_instances as (Vue & {accessories: {[key: string]: Accessory}})[]) {
            for (const accessory of Object.values(component.accessories)) {
                accessory.refreshDisplayServices();
            }
        }
    }

    /**
     * Registers a service tile component (the small tile).
     *
     * @param {string} type The service type UUID
     * @param {VueComponent} component
     */
    registerServiceTileComponent(type: string, component: Component) {
        if (ServiceTileComponents.has(type)) {
            throw new Error('There is already a service component with the type "' + type + '"');
        }

        if (!component.name) {
            // @ts-ignore
            component.name = service_type_names[type] || 'service-tile-' + type;
        }

        ServiceTileComponents.addPluginComponent(this.ui_plugin, type, component);

        this.refreshDisplayServices();
    }

    registerServiceComponent(type, component) {
        this.registerServiceTileComponent(type, component);
    }

    /**
     * Registers a service details component (the full screen view).
     *
     * @param {string} type The service type UUID
     * @param {VueComponent} component
     */
    registerServiceDetailsComponent(type: string, component: Component) {
        if (ServiceDetailsComponents.has(type)) {
            throw new Error('There is already a service details component with the type "' + type + '"');
        }

        if (!component.name) {
            // @ts-ignore
            component.name = service_type_names[type] || 'service-details-' + type;
        }

        ServiceDetailsComponents.addPluginComponent(this.ui_plugin, type, component);

        this.refreshDisplayServices();
    }

    registerAccessoryDetailsComponent(type, component) {
        this.registerServiceDetailsComponent(type, component);
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
    registerCollapsedService(type: string, collapsed_service_types: string[]) {
        if (collapsed_services[type]) {
            throw new Error('There is already a collapsed service with the UUID "' + type + '"');
        }

        if (!(collapsed_service_types instanceof Array)) {
            throw new Error('collapsed_service_types must be an Array');
        }

        for (const collapsed_service_type of collapsed_service_types) {
            for (const registered_collapsed_service of Object.values(collapsed_services)) {
                if (registered_collapsed_service instanceof Array &&
                    registered_collapsed_service.includes(collapsed_service_type)
                ) {
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
    registerAccessoryDiscoveryComponent(localid: string, component: Component) {
        const id = this.ui_plugin.plugin_accessory_discovery_handlers[localid];
        const setup_handler = this.ui_plugin.plugin_accessory_discovery_handler_setup_handlers[localid];

        if (typeof id === 'undefined') {
            throw new Error('Unknown accessory discovery handler "' + localid + '"');
        }
        if (typeof setup_handler === 'undefined') {
            throw new Error('Unknown accessory setup handler for accessory discovery handler "' + localid + '"');
        }

        if (AccessoryDiscoveryComponents.has(id)) {
            throw new Error('There is already an accessory discovery component with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!component.name) {
            // @ts-ignore
            component.name = 'accessory-discovery-' + localid;
        }

        AccessoryDiscoveryComponents.addPluginComponent(this.ui_plugin, id, {component, setup_handler});
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
    registerAccessorySetupComponent(localid: string, component: Component, options?: {
        name?: string; manual?: boolean;
    }) {
        const id = this.ui_plugin.plugin_accessory_setup_handlers[localid];
        const name = options && options.name || localid;
        const manual = options && options.manual || false;

        if (typeof id === 'undefined') {
            throw new Error('Unknown accessory setup handler "' + localid + '"');
        }

        if (AccessorySetupComponents.has(id)) {
            throw new Error('There is already an accessory setup component with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!component.name) {
            // @ts-ignore
            component.name = 'accessory-setup-' + localid;
        }

        AccessorySetupComponents.addPluginComponent(this.ui_plugin, id, {component, name, manual});
    }

    /**
     * Registers a service settings component.
     *
     * @param {string} type The service type UUID
     * @param {VueComponent} component
     */
    registerServiceSettingsComponent(type: string, component: Component) {
        if (ServiceSettingsComponents.has(type)) {
            throw new Error('There is already a service settings component with the type "' + type + '"');
        }

        if (!component.name) {
            // @ts-ignore
            component.name = service_type_names[type] || 'service-settings-' + type;
        }

        ServiceSettingsComponents.addPluginComponent(this.ui_plugin, type, component);
    }

    registerAccessorySettingsComponent(type, component) {
        this.registerServiceSettingsComponent(type, component);
    }

    /**
     * Registers an authentication handler component.
     *
     * @param {string} localid The authentication handler ID
     * @param {VueComponent} component
     * @param {string} name A display name for the authentication handler (used when multiple authentication handlers are available)
     */
    registerAuthenticationHandlerComponent(localid: string, component: Component, name?: string) {
        const id = this.ui_plugin.plugin_authentication_handlers[localid];

        if (typeof id === 'undefined') {
            throw new Error('Unknown authentication handler "' + localid + '"');
        }

        if (AuthenticationHandlerComponents.has(id)) {
            throw new Error('There is already an authentication handler component with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!name) name = localid;

        if (!component.name) {
            // @ts-ignore
            component.name = 'authentication-handler-' + localid;
        }

        AuthenticationHandlerComponents.addPluginComponent(this.ui_plugin, id, {component, name});
    }

    /**
     * Registers a user management handler.
     *
     * @param {string} localid
     * @param {function} handler A class that extends UserManagementHandler
     * @param {string} [name]
     */
    registerUserManagementHandler<H extends typeof UserManagementHandler>(localid: string, handler: H, name) {
        const id = this.ui_plugin.plugin_user_management_handlers[localid];

        if (typeof id === 'undefined') {
            throw new Error('Unknown user management handler "' + localid + '"');
        }

        if (UserManagementHandlers.has(id)) {
            throw new Error('There is already a user management handler with the ID "' + localid +
                '" (global ID of "' + id + '")');
        }

        if (!(handler.prototype instanceof UserManagementHandler)) {
            throw new Error('handler must be a class that extends UserManagementHandler');
        }

        if (name || !handler.name) Object.defineProperty(handler, 'name', {configurable: true, value: name || localid});

        Object.defineProperty(handler, 'user_management_handler_id', {value: id});
        Object.defineProperty(handler, 'user_management_handler_localid', {value: localid});

        UserManagementHandlers.addPluginComponent(this.ui_plugin, id, handler);
    }

    /**
     * Registers a layout section component.
     *
     * @param {string} type The section type ID
     * @param {VueComponent} component
     * @param {string} name A display name for the authentication handler
     */
    registerLayoutSectionComponent(type: string, component: Component, name: string) {
        if (LayoutSectionComponents.has(type)) {
            throw new Error('There is already a layout section component with the ID "' + type + '"');
        }

        if (!component.name) {
            // @ts-ignore
            component.name = 'layout-section-' + type;
        }

        LayoutSectionComponents.addPluginComponent(this.ui_plugin, type, {component, name});
    }

    /**
     * Registers an automation trigger editor component.
     *
     * @param {string} type
     * @param {VueComponent} component
     * @param {string} name A display name for the automation trigger
     * @param {string} [plugin] The name of the plugin that registered the automation trigger
     */
    registerAutomationTriggerComponent(type: string, component: Component, name: string, plugin?: string) {
        if (!plugin) plugin = this.ui_plugin.plugin;
        if (!plugin) throw new Error('Unknown plugin');

        if (AutomationTriggerComponents.find(c => c.plugin === plugin && c.type === type)) {
            throw new Error('There is already an automation trigger component with the ID "' + type +
                '" for the plugin "' + plugin + '"');
        }

        if (!name) name = type + ' (' + plugin + ')';

        if (!component.name) {
            // @ts-ignore
            component.name = 'automation-trigger-' + plugin + '-' + type;
        }

        AutomationTriggerComponents.pushPluginComponent(this.ui_plugin, {component, plugin, type, name});
    }

    /**
     * Registers an automation condition editor component.
     *
     * @param {string} type
     * @param {VueComponent} component
     * @param {string} name A display name for the automation condition
     * @param {string} [plugin] The name of the plugin that registered the automation condition
     */
    registerAutomationConditionComponent(type: string, component: Component, name: string, plugin?: string) {
        if (!plugin) plugin = this.ui_plugin.plugin;
        if (!plugin) throw new Error('Unknown plugin');

        if (AutomationConditionComponents.find(c => c.plugin === plugin && c.type === type)) {
            throw new Error('There is already an automation condition component with the ID "' + type +
                '" for the plugin "' + plugin + '"');
        }

        if (!name) name = type + ' (' + plugin + ')';

        if (!component.name) {
            // @ts-ignore
            component.name = 'automation-condition-' + plugin + '-' + type;
        }

        AutomationConditionComponents.pushPluginComponent(this.ui_plugin, {component, plugin, type, name});
    }

    /**
     * Registers an automation action editor component.
     *
     * @param {string} type
     * @param {VueComponent} component
     * @param {string} name A display name for the automation action
     * @param {string} [plugin] The name of the plugin that registered the automation action
     */
    registerAutomationActionComponent(type: string, component: Component, name: string, plugin?: string) {
        if (!plugin) plugin = this.ui_plugin.plugin;
        if (!plugin) throw new Error('Unknown plugin');

        if (AutomationActionComponents.find(c => c.plugin === plugin && c.type === type)) {
            throw new Error('There is already an automation action component with the ID "' + type +
                '" for the plugin "' + plugin + '"');
        }

        if (!name) name = type + ' (' + plugin + ')';

        if (!component.name) {
            // @ts-ignore
            component.name = 'automation-action-' + plugin + '-' + type;
        }

        AutomationActionComponents.pushPluginComponent(this.ui_plugin, {component, plugin, type, name});
    }
}

export abstract class UserManagementHandler {
    private static id = 0;

    readonly id: number;
    readonly ui_plugin: UIPlugin;
    readonly connection: UserManagementConnection;

    static user_management_handler_id: number;
    static user_management_handler_localid: number;

    constructor(ui_plugin: UIPlugin, /* id, */ connection: Connection) {
        Object.defineProperty(this, 'id', {value: UserManagementHandler.id++});
        Object.defineProperty(this, 'ui_plugin', {value: ui_plugin});
        Object.defineProperty(this, 'connection', {value:
            new UserManagementConnection(connection, this.user_management_handler_id)});
    }

    get accessory_ui() {
        return this.ui_plugin;
    }

    get user_management_handler_id() {
        return (this.constructor as typeof UserManagementHandler).user_management_handler_id;
    }
    get user_management_handler_localid() {
        return (this.constructor as typeof UserManagementHandler).user_management_handler_localid;
    }

    static get component() {
        throw new Error('The user management handler didn\'t set the component property');
    }
    static set component(value) {
        Object.defineProperty(this, 'component', {writable: true, value});
    }

    async getUsers(): Promise<UserManagementUser[]> {
        throw new Error('The user management handler didn\'t override the getUsers method');
    }
}
