/// <reference path="../types/homebridge.d.ts" />

import Server from './server';
import PluginManager, {Plugin, AccessoryPlatformHandler, DynamicAccessoryPlatformHandler} from './plugins';
import Bridge from './bridge';
import Homebridge from './homebridge';

import Logger from '../common/logger';
import {
    AddAccessoryEvent, RemoveAccessoryEvent,
    CharacteristicUpdateEvent, UpdateAccessoryConfigurationEvent,
} from '../events/server';
import {BridgeConfiguration, AccessoryPlatformConfiguration} from '../cli/configuration';

import {Accessory, Service, Characteristic} from 'hap-nodejs';
import * as hap from 'hap-nodejs';
import {PlatformAccessory} from 'homebridge/lib/platformAccessory';

export default class AccessoryManager {
    readonly server: Server;
    readonly log: Logger;

    readonly accessories: PluginAccessory[] = [];
    readonly accessory_platforms: AccessoryPlatform[] = [];
    readonly cached_accessories: PluginAccessory[] = [];

    readonly bridges: Bridge[] = [];
    readonly homebridge: Homebridge | null = null;

    private readonly characteristic_change_handlers!: WeakMap<typeof Accessory, Function>;
    readonly _handleCharacteristicUpdate: any;
    private readonly configuration_change_handlers!: WeakMap<typeof Accessory, Function>;
    private readonly _handleConfigurationChange: any;

    private readonly _handleRegisterHomebridgePlatformAccessories: any;
    private readonly _handleUnregisterHomebridgePlatformAccessories: any;
    private readonly _handleRegisterExternalHomebridgeAccessories: any;

    constructor(server: Server) {
        this.server = server;
        this.log = server.log.withPrefix('Accessories');

        Object.defineProperty(this, 'characteristic_change_handlers', {value: new WeakMap()});
        Object.defineProperty(this, '_handleCharacteristicUpdate', {value: (a: typeof Accessory, event: any) => {
            // this.log.info('Updating characteristic', event);
            this.handleCharacteristicUpdate(event.accessory || a, event.service,
                event.characteristic, event.newValue, event.oldValue, event.context);
        }});

        Object.defineProperty(this, 'configuration_change_handlers', {value: new WeakMap()});
        Object.defineProperty(this, '_handleConfigurationChange', {value: (a: typeof Accessory, event: any) => {
            this.log.debug('Updating accessory configuration', event);
            this.handleConfigurationChange(event.accessory || a, event.service, event.characteristic);
        }});

        Object.defineProperty(this, '_handleRegisterHomebridgePlatformAccessories', {value:
            this.handleRegisterHomebridgePlatformAccessories.bind(this)});
        Object.defineProperty(this, '_handleUnregisterHomebridgePlatformAccessories', {value:
            this.handleUnregisterHomebridgePlatformAccessories.bind(this)});
        Object.defineProperty(this, '_handleRegisterExternalHomebridgeAccessories', {value:
            this.handleRegisterExternalHomebridgeAccessories.bind(this)});
    }

    /**
     * Gets an Accessory.
     *
     * @param {string} uuid
     * @return {Accessory}
     */
    getAccessory(uuid: string): typeof Accessory | null {
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

        return null;
    }

    /**
     * Gets a PluginAccessory.
     *
     * @param {string} uuid
     * @return {PluginAccessory}
     */
    getPluginAccessory(uuid: string): PluginAccessory | null {
        return this.accessories.find(accessory => accessory.uuid === uuid) || null;
    }

    /**
     * Gets a Service.
     *
     * @param {(string|Array)} uuid
     * @param {string} [service_uuid]
     * @return {Service}
     */
    getService(uuid: string | string[], service_uuid?: string): typeof Service | null {
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
    getCharacteristic(uuid: string | string[], service_uuid?: string, characteristic_uuid?: string):
        typeof Characteristic | null {
        if (uuid instanceof Array) [uuid, service_uuid, characteristic_uuid] = uuid;

        const accessory_uuid = uuid.split('.')[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);
        if (!characteristic_uuid) {
            characteristic_uuid = service_uuid.substr(service_uuid.lastIndexOf('.') + 1);
            service_uuid = service_uuid.substr(0, service_uuid.lastIndexOf('.'));
        }

        const service = this.getService(accessory_uuid, service_uuid);
        if (!service) return;

        return service.characteristics.find((c: typeof Characteristic) => c.UUID === characteristic_uuid);
    }

    /**
     * Adds a accessory.
     *
     * @param {PluginAccessory} plugin_accessory
     */
    addAccessory(plugin_accessory: PluginAccessory) {
        // eslint-disable-next-line curly
        if (this.accessories.find(a => a.uuid === plugin_accessory.uuid)) throw new Error('Already have an' +
            ' accessory with the UUID "' + plugin_accessory.uuid + '"');

        plugin_accessory.accessory.bridged = true;

        const prev_characteristic_change_handler = this.characteristic_change_handlers.get(plugin_accessory.accessory);
        if (prev_characteristic_change_handler) {
            plugin_accessory.accessory.removeListener('service-characteristic-change',
                prev_characteristic_change_handler);
        }
        const characteristic_change_handler = this._handleCharacteristicUpdate.bind(this, plugin_accessory.accessory);
        this.characteristic_change_handlers.set(plugin_accessory.accessory, characteristic_change_handler);
        plugin_accessory.accessory.on('service-characteristic-change', characteristic_change_handler);

        const prev_configuration_change_handler = this.configuration_change_handlers.get(plugin_accessory.accessory);
        if (prev_configuration_change_handler) {
            plugin_accessory.accessory.removeListener('service-configurationChange', prev_configuration_change_handler);
        }
        const configuration_change_handler = this._handleConfigurationChange.bind(this, plugin_accessory.accessory);
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
                        plugin_accessory.accessory_platform_name : null) &&
                accessory_uuid[2] === plugin_accessory.accessory.displayName :
                accessory_uuid === plugin_accessory.uuid
        ))) {
            bridge.addAccessory(plugin_accessory.accessory);
        }

        this.server.emit(AddAccessoryEvent, this.server, plugin_accessory);
    }

    /**
     * Removes an accessory.
     *
     * @param {PluginAccessory} plugin_accessory
     */
    removeAccessory(plugin_accessory: PluginAccessory) {
        const characteristic_change_handler = this.characteristic_change_handlers.get(plugin_accessory.accessory);
        if (characteristic_change_handler) {
            plugin_accessory.accessory.removeListener('service-characteristic-change',
                this._handleCharacteristicUpdate);
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
            if (!bridge.bridge.bridgedAccessories.find((a: typeof Accessory) => a.UUID === plugin_accessory.uuid)) {
                continue;
            }

            bridge.removeAccessory(plugin_accessory.accessory);
        }

        this.server.emit(RemoveAccessoryEvent, this.server, plugin_accessory);
    }

    async loadAccessory(accessory_config: any) {
        const {plugin: plugin_name, accessory: accessory_type, name} = accessory_config;

        // eslint-disable-next-line curly
        if (!accessory_type || !name) throw new Error('Invalid accessory configuration: accessories must have the' +
            ' plugin, accessory and name properties');

        const {builtin_accessory_types}: typeof import('../accessories') = require('../accessories');

        const is_builtin = !plugin_name && builtin_accessory_types[accessory_type];

        const plugin = is_builtin ? null : PluginManager.getPlugin(plugin_name);
        if (!plugin && !is_builtin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const accessory_handler = is_builtin ? builtin_accessory_types[accessory_type] :
            plugin!.getAccessoryHandler(accessory_type);
        if (!accessory_handler) throw new Error('No accessory handler with the name "' + accessory_type + '"');

        // eslint-disable-next-line curly
        if (!accessory_config.uuid) accessory_config.uuid = hap.uuid.generate('accessory:' + plugin_name + ':' +
            accessory_type + ':' + name);

        const cached_accessory = this.getCachedAccessory(accessory_config.uuid);

        const accessory = await accessory_handler.call(plugin, accessory_config,
            cached_accessory ? cached_accessory.accessory : undefined);

        const plugin_accessory = new PluginStandaloneAccessory(this.server, accessory, plugin, accessory_type,
            accessory_config, accessory_config.uuid);

        this.addAccessory(plugin_accessory);
    }

    /**
     * Loads an accessory platform.
     *
     * @param {object} config
     * @return {Promise}
     */
    async loadAccessoryPlatform(config: any) {
        const {plugin: plugin_name, platform: accessory_platform_name, name} = config;

        // eslint-disable-next-line curly
        if (!accessory_platform_name || !name) throw new Error('Invalid accessory platform configuration: accessory' +
            ' platforms must have the plugin, platform and name properties');

        const {builtin_accessory_platforms}: typeof import('../accessories') = require('../accessories');

        const is_builtin = !plugin_name && builtin_accessory_platforms[accessory_platform_name];

        const plugin = is_builtin ? null : PluginManager.getPlugin(plugin_name);
        if (!plugin && !is_builtin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const AccessoryPlatformHandler = is_builtin ? builtin_accessory_platforms[accessory_platform_name] :
            plugin!.getAccessoryPlatformHandler(accessory_platform_name);
        if (!AccessoryPlatformHandler) throw new Error('No accessory platform handler with the name "' + // eslint-disable-line curly
            accessory_platform_name + '"');

        if (!config.uuid) config.uuid = 'accessoryplatform:' + plugin_name + ':' + accessory_platform_name + ':' + name;

        // eslint-disable-next-line curly
        if (this.accessory_platforms.find(p => p.config.uuid === config.uuid)) throw new Error('Already have an' +
            ' accessory platform with the UUID base "' + config.uuid + '"');

        const cached_accessories = this.getCachedAccessoryPlatformAccessories(config.uuid, plugin,
            accessory_platform_name).map(plugin_accessory => plugin_accessory.accessory);

        const accessory_platform = new AccessoryPlatformHandler(plugin!, this.server, config, cached_accessories);
        await accessory_platform.init(cached_accessories);

        this.accessory_platforms.push(accessory_platform);

        return accessory_platform;
    }

    async loadCachedAccessory(cache: any) {
        const plugin_accessory = PluginAccessory.restore(this.server, cache);

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
    getCachedAccessory(uuid: string, plugin?: Plugin, accessory_type?: string) {
        return this.cached_accessories.find(accessory => accessory instanceof PluginStandaloneAccessory &&
            accessory.uuid === uuid &&
            (!plugin || accessory.plugin === plugin) &&
            ((!plugin && !accessory_type) || accessory.accessory_type === accessory_type)
        ) as PluginStandaloneAccessory;
    }

    /**
     * Gets an accessory platform's cached accessories.
     *
     * @param {string} base_uuid
     * @param {Plugin} plugin
     * @param {string} accessory_platform_name
     * @return {PluginAccessoryPlatformAccessory[]}
     */
    getCachedAccessoryPlatformAccessories(base_uuid: string, plugin: Plugin | null, accessory_platform_name: string) {
        return this.cached_accessories.filter(accessory => accessory instanceof PluginAccessoryPlatformAccessory &&
            accessory.base_uuid === base_uuid &&
            accessory.plugin === plugin &&
            accessory.accessory_platform_name === accessory_platform_name) as PluginAccessoryPlatformAccessory[];
    }

    /**
     * Removes a cached accessory.
     *
     * @param {string} uuid
     */
    removeCachedAccessory(uuid: string) {
        let index;
        while ((index = this.cached_accessories.findIndex(accessory => accessory.uuid === uuid)) !== -1) {
            this.cached_accessories.splice(index, 1);
        }
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
    loadBridge(bridge_config: BridgeConfiguration, uuid?: string) {
        // bridge_config.username is required - all other properties are optional
        const name = bridge_config.name || 'Bridge ' + bridge_config.username.match(/(.{2}\:.{2})$/)![1];

        const bridge = new Bridge(this.server, this.log.withPrefix(name), {
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
                    accessory_uuid[0] === (accessory.plugin ? accessory.plugin.name : null) &&
                    // @ts-ignore
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (accessory) bridge.addAccessory(accessory.accessory);

                const cached_accessory = this.cached_accessories.find(accessory =>
                    accessory_uuid[0] === (accessory.plugin ? accessory.plugin.name : null) &&
                    // @ts-ignore
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
    async unloadBridge(bridge: Bridge | string) {
        if (!(bridge instanceof Bridge)) {
            bridge = this.bridges.find(b => b.uuid === bridge)!;
            if (!bridge) throw new Error('Unknown bridge');
        }

        if (bridge instanceof Homebridge) {
            throw new Error('Homebridge cannot be unloaded');
        }

        await bridge.unpublish();

        let index;
        while ((index = this.bridges.findIndex(b => b.uuid === (bridge as Bridge).uuid)) !== -1) {
            this.bridges.splice(index, 1);
        }
    }

    loadHomebridge() {
        if (this.homebridge) return this.homebridge;

        // config.bridge, config.accessories and config.platforms are for Homebridge
        // If any of these exist, the user wants to run Homebridge as well
        (this as any).homebridge = new Homebridge(this.server, this.log.withPrefix('Homebridge'), {
            bridge: this.server.config.bridge,
            accessories: this.server.config.accessories,
            platforms: this.server.config.platforms,
        });

        this.bridges.push(this.homebridge!);

        return this.homebridge!;
    }

    async loadHomebridgeAccessories() {
        if (!this.homebridge) this.loadHomebridge();

        for (const accessory of this.homebridge!.bridge.bridgedAccessories) {
            const plugin_accessory = new HomebridgeAccessory(this.server, accessory);

            this.addAccessory(plugin_accessory);
        }

        for (const platform_accessory of
            Object.values(this.homebridge!.homebridge._publishedAccessories) as PlatformAccessory[]
        ) {
            const plugin_accessory = new HomebridgeAccessory(this.server, platform_accessory._associatedHAPAccessory,
                platform_accessory);

            this.addAccessory(plugin_accessory);
        }

        this.homebridge!.homebridge._api
            .on('handleRegisterPlatformAccessories', this._handleRegisterHomebridgePlatformAccessories);
        this.homebridge!.homebridge._api
            .on('handleUnregisterPlatformAccessories', this._handleUnregisterHomebridgePlatformAccessories);
        this.homebridge!.homebridge._api
            .on('publishExternalAccessories', this._handleRegisterExternalHomebridgeAccessories);
    }

    private handleRegisterHomebridgePlatformAccessories(accessories: PlatformAccessory[]) {
        for (const platform_accessory of accessories) {
            const accessory = platform_accessory._associatedHAPAccessory;
            if (!accessory) continue;

            const plugin_accessory = new HomebridgeAccessory(this.server, accessory, platform_accessory);

            this.addAccessory(plugin_accessory);
        }
    }

    private handleUnregisterHomebridgePlatformAccessories(accessories: PlatformAccessory[]) {
        for (const platform_accessory of accessories) {
            const accessory = platform_accessory._associatedHAPAccessory;
            if (!accessory) continue;

            const plugin_accessory = this.accessories.find(a => a instanceof HomebridgeAccessory &&
                (a.platform_accessory === platform_accessory || a.uuid === accessory.UUID));
            if (!plugin_accessory) continue;

            this.removeAccessory(plugin_accessory);
        }
    }

    private handleRegisterExternalHomebridgeAccessories(accessories: PlatformAccessory[]) {
        for (const platform_accessory of accessories) {
            const accessory = platform_accessory._associatedHAPAccessory;
            if (!accessory) continue;

            const plugin_accessory = new HomebridgeAccessory(this.server, accessory, platform_accessory);

            this.addAccessory(plugin_accessory);
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
    private async handleCharacteristicUpdate(
        accessory: typeof Accessory, service: typeof Service, characteristic: typeof Characteristic,
        value: any, old_value: any, context: any
    ) {
        this.server.emit(CharacteristicUpdateEvent,
            this.server, accessory, service, characteristic, value, old_value, context);

        if (this.hasOwnProperty('automations')) {
            this.server.automations
                .handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context);
        }

        this.server.sendBroadcast({
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
    private handleConfigurationChange(
        accessory: typeof Accessory, service: typeof Service, characteristic: typeof Characteristic
    ) {
        this.server.emit(UpdateAccessoryConfigurationEvent, this.server, accessory, service, characteristic);

        // ...
    }

    /**
     * Handle changes to a HAP server's pairings.
     *
     * @param {Bridge} bridge
     */
    handlePairingsUpdate(bridge: Bridge) {
        this.server.sendBroadcast({
            type: 'update-pairings',
            bridge_uuid: bridge.uuid,
            // pairings: ...,
        });
    }
}

export class AccessoryPlatform {
    readonly plugin!: Plugin;
    readonly server!: Server;
    readonly config!: AccessoryPlatformConfiguration;
    readonly accessories!: PluginAccessoryPlatformAccessory[];
    readonly cached_accessories!: typeof Accessory[];

    /**
     * Creates an AccessoryPlatform.
     *
     * @param {Plugin} plugin
     * @param {Server} server
     * @param {object} config
     * @param {Array} cached_accessories
     */
    constructor(
        plugin: Plugin, server: Server, config: AccessoryPlatformConfiguration, cached_accessories: typeof Accessory[]
    ) {
        Object.defineProperty(this, 'plugin', {value: plugin});
        Object.defineProperty(this, 'server', {value: server});
        Object.defineProperty(this, 'config', {value: Object.freeze(config)});
        Object.defineProperty(this, 'accessories', {value: []});
        Object.defineProperty(this, 'cached_accessories', {value: cached_accessories});
    }

    static withHandler(handler: AccessoryPlatformHandler) {
        return class extends AccessoryPlatform {
            async init(cached_accessories: typeof Accessory[]) {
                const accessories = await handler.call(this.plugin, this.config, cached_accessories);

                this.addAccessory(...accessories);
                this.removeAllCachedAccessories();
            }
        };
    }

    static withDynamicHandler(handler: DynamicAccessoryPlatformHandler) {
        return class extends AccessoryPlatform {
            async init(cached_accessories: typeof Accessory[]) {
                const accessories = await handler.call(this.plugin, this, this.config, cached_accessories);

                this.addAccessory(...accessories);
                this.removeAllCachedAccessories();
            }
        };
    }

    /**
     * Initialise the accessory platform.
     * Plugins should override this method.
     *
     * @param {Array} cached_accessories
     */
    async init(cached_accessories: typeof Accessory[]) {
        this.addAccessory(...cached_accessories);
    }

    /**
     * Adds an accessory.
     * This will automatically remove it from the cached accessories.
     *
     * @param {Accessory} accessory
     */
    addAccessory(...accessories: typeof Accessory[]) {
        for (const accessory of accessories) {
            const plugin_accessory = new PluginAccessoryPlatformAccessory(this.server, accessory, this.plugin,
                this.constructor.name, this.config.uuid!);

            this.server.accessories.addAccessory(plugin_accessory);
            this.removeCachedAccessory(accessory.UUID);
            this.accessories.push(plugin_accessory);
        }
    }

    /**
     * Removes an accessory.
     *
     * @param {Accessory} accessory
     */
    removeAccessory(...accessories: typeof Accessory[]) {
        for (const accessory of accessories) {
            let index;
            while ((index = this.accessories.findIndex(a => a.uuid === accessory.UUID)) !== -1) {
                this.server.accessories.removeAccessory(this.accessories[index]);
                this.accessories.splice(index, 1);
            }
        }
    }

    /**
     * Removes a cached accessory.
     *
     * @param {string} uuid
     */
    removeCachedAccessory(uuid: string) {
        this.server.accessories.removeCachedAccessory(uuid);

        let index;
        while ((index = this.cached_accessories.findIndex(accessory => accessory.UUID === uuid)) !== -1) {
            this.cached_accessories.splice(index, 1);
        }
    }

    /**
     * Removes all cached accessories.
     */
    removeAllCachedAccessories() {
        for (const accessory of this.cached_accessories) {
            this.server.accessories.removeCachedAccessory(accessory.UUID);
        }

        this.cached_accessories.splice(0, this.cached_accessories.length);
    }
}

export class PluginAccessory {
    readonly server!: Server;
    readonly accessory!: typeof Accessory;
    readonly plugin!: Plugin | null;
    readonly data: any;
    readonly cached_data: any;

    constructor(server: Server, accessory: typeof Accessory, plugin: Plugin | null, data?: any) {
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

        (this.accessory as any).emit('destroy');
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
                    characteristics: service.characteristics.map((characteristic: any) => ({
                        displayName: characteristic.displayName,
                        UUID: characteristic.UUID,
                        value: characteristic.value,
                        status: characteristic.status,
                        eventOnlyCharacteristic: characteristic.eventOnlyCharacteristic,
                        props: characteristic.props,
                    })),
                    optionalCharacteristics: service.optionalCharacteristics.map((characteristic: any) => ({
                        displayName: characteristic.displayName,
                        UUID: characteristic.UUID,
                        value: characteristic.value,
                        status: characteristic.status,
                        eventOnlyCharacteristic: characteristic.eventOnlyCharacteristic,
                        props: characteristic.props,
                    })),
                })),
                external_groups: this instanceof HomebridgeAccessory ? undefined :
                    (this.accessory as any).external_groups,
            },
            plugin: this.plugin ? this.plugin.name : null,
            uuid: this.uuid,
            is_homebridge: this instanceof HomebridgeAccessory,
            accessory_type: (this as any as PluginStandaloneAccessory).accessory_type,
            base_uuid: (this as any as PluginAccessoryPlatformAccessory).base_uuid,
            accessory_platform: (this as any as PluginAccessoryPlatformAccessory).accessory_platform_name,
            data: this.data,
            bridge_uuids: this.server.accessories.bridges
                .filter(b => b.accessory_uuids.includes(this.accessory.UUID)).map(b => b.uuid),
            bridge_uuids_external: this.server.accessories.bridges
                .filter(b => b.accessory_uuids.includes(this.accessory.UUID) &&
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
    static restore(server: Server, cache: any) {
        const accessory = new Accessory(cache.accessory.displayName, cache.accessory.UUID);

        accessory.services = cache.accessory.services.map((service_cache: any) => {
            const service = new Service(service_cache.displayName, service_cache.UUID, service_cache.subtype);

            service.characteristics = service_cache.characteristics.map((characteristic_cache: any) => {
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
            // @ts-ignore
            plugin_accessory.cached_data = cache;
            return plugin_accessory;
        }

        (accessory as any).external_groups = cache.accessory.external_groups;

        const {builtin_accessory_types, builtin_accessory_platforms}: typeof import('../accessories') =
            require('../accessories');

        const is_builtin = !cache.plugin && (builtin_accessory_types[cache.accessory_type] ||
            builtin_accessory_platforms[cache.accessory_platform]);

        const plugin = is_builtin ? null : PluginManager.getPlugin(cache.plugin);
        if (!plugin && !is_builtin) throw new Error('Unknown plugin "' + cache.plugin + '"');

        const accessory_handler = cache.accessory_type ? is_builtin ? builtin_accessory_types[cache.accessory_type] :
            plugin!.getAccessoryHandler(cache.accessory_type) : undefined;
        if (cache.accessory_type && !accessory_handler) throw new Error('Unknown accessory "' + // eslint-disable-line curly
            cache.accessory_type + '"');

        const accessory_platform_handler = cache.accessory_platform ? is_builtin ?
            builtin_accessory_platforms[cache.accessory_platform] :
            plugin!.getAccessoryPlatformHandler(cache.accessory_platform) : undefined;
        if (cache.accessory_platform && !accessory_platform_handler) throw new Error('Unknown accessory platform "' + // eslint-disable-line curly
            cache.accessory_platform + '"');

        if (!accessory_handler && !accessory_platform_handler) throw new Error('Invalid cache data');

        const plugin_accessory = accessory_platform_handler ?
            new PluginAccessoryPlatformAccessory(server, accessory, plugin, cache.accessory_platform, cache.base_uuid) :
            new PluginStandaloneAccessory(server, accessory, plugin, cache.accessory_type, null, cache.uuid);

        // @ts-ignore
        plugin_accessory.cached_data = cache;

        return plugin_accessory;
    }
}

export class PluginStandaloneAccessory extends PluginAccessory {
    readonly config: any;
    readonly uuid!: string;
    readonly accessory_type!: string;

    constructor(
        server: Server, accessory: typeof Accessory, plugin: Plugin | null, accessory_type: string,
        config: any, uuid: string
    ) {
        super(server, accessory, plugin);

        Object.defineProperty(this, 'config', {value: config});
        Object.defineProperty(this, 'uuid', {value: uuid || accessory.UUID});
        Object.defineProperty(this, 'accessory_type', {value: accessory_type});
    }
}

export class PluginAccessoryPlatformAccessory extends PluginAccessory {
    readonly base_uuid!: string;
    readonly accessory_platform_name!: string;

    constructor(
        server: Server, accessory: typeof Accessory, plugin: Plugin | null, accessory_platform_name: string, base_uuid: string
    ) {
        super(server, accessory, plugin);

        Object.defineProperty(this, 'base_uuid', {value: base_uuid});
        Object.defineProperty(this, 'accessory_platform_name', {value: accessory_platform_name});
    }
}

export class HomebridgeAccessory extends PluginAccessory {
    readonly platform_accessory: PlatformAccessory;

    constructor(server: Server, accessory: typeof Accessory, platform_accessory?: PlatformAccessory) {
        super(server, accessory, null);

        Object.defineProperty(this, 'platform_accessory', {value: platform_accessory});
    }
}
