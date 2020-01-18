/// <reference path="../types/homebridge.d.ts" />

import Server from './server';
import PluginManager, {
    Plugin,
    AccessoryHandler, AccessoryPlatformHandler, DynamicAccessoryPlatformHandler,
} from './plugins';
import Bridge from './bridge';
import Homebridge from './homebridge';

import Logger from '../common/logger';
import {
    AddAccessoryEvent, RemoveAccessoryEvent,
    CharacteristicUpdateEvent, UpdateAccessoryConfigurationEvent, UpdateAccessoryStatusEvent,
} from '../events/server';
import {
    BridgeConfiguration, AccessoryPlatformConfiguration,
    HomebridgeBridgeConfiguration, HomebridgeAccessoryConfiguration, HomebridgePlatformConfiguration,
} from '../cli/configuration';
import {AccessoryType} from '../common/types/storage';
import {AccessoryStatus} from '../common/types/accessories';

import {Accessory, Service, Characteristic} from '../hap-nodejs';
import * as hap from '../hap-nodejs';
import {PlatformAccessory} from 'homebridge/lib/platformAccessory';
import * as util from '../util';

export default class AccessoryManager {
    readonly server: Server;
    readonly log: Logger;

    readonly accessories: PluginAccessory<boolean>[] = [];
    readonly accessory_platforms: AccessoryPlatform[] = [];
    readonly cached_accessories: PluginAccessory[] = [];

    readonly bridges: Bridge[] = [];
    readonly homebridge: Homebridge | null = null;

    private readonly characteristic_change_handlers!: WeakMap<Accessory, Function>;
    readonly _handleCharacteristicUpdate: any;
    private readonly configuration_change_handlers!: WeakMap<Accessory, Function>;
    private readonly _handleConfigurationChange: any;

    private readonly _handleRegisterHomebridgePlatformAccessories: any;
    private readonly _handleUnregisterHomebridgePlatformAccessories: any;
    private readonly _handleRegisterExternalHomebridgeAccessories: any;

    constructor(server: Server) {
        this.server = server;
        this.log = server.log.withPrefix('Accessories');

        Object.defineProperty(this, 'characteristic_change_handlers', {value: new WeakMap()});
        Object.defineProperty(this, '_handleCharacteristicUpdate', {value: (a: Accessory, event: any) => {
            // this.log.info('Updating characteristic', event);
            this.handleCharacteristicUpdate(event.accessory || a, event.service,
                event.characteristic, event.newValue, event.oldValue, event.context);
        }});

        Object.defineProperty(this, 'configuration_change_handlers', {value: new WeakMap()});
        Object.defineProperty(this, '_handleConfigurationChange', {value: (a: Accessory, event: any) => {
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
    getAccessory(uuid: string): Accessory | null {
        const plugin_accessory = this.getPluginAccessory(uuid);
        if (plugin_accessory) return plugin_accessory.accessory;

        const cached_plugin_accessory = this.getCachedAccessory(uuid) || this.getCachedHomebridgeAccessory(uuid);
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
    getService(uuid: string | string[], service_uuid?: string): Service | null {
        if (uuid instanceof Array) [uuid, service_uuid] = uuid;

        const accessory_uuid = uuid.split('.')[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);

        const service_type = service_uuid.split('.')[0];
        const service_subtype = service_uuid.substr(service_type.length + 1);

        const accessory = this.getAccessory(accessory_uuid);
        if (!accessory) return null;

        return accessory.services.find(s => s.UUID === service_type &&
            (s.subtype === service_subtype || (!s.subtype && !service_subtype))) || null;
    }

    /**
     * Gets a Characteristic.
     *
     * @param {(string|Array)} uuid
     * @param {string} [service_uuid]
     * @param {string} [characteristic_uuid]
     * @return {Characteristic}
     */
    getCharacteristic(
        uuid: string | string[], service_uuid?: string, characteristic_uuid?: string
    ): Characteristic | null {
        if (uuid instanceof Array) [uuid, service_uuid, characteristic_uuid] = uuid;

        const accessory_uuid = uuid.split('.')[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);
        if (!characteristic_uuid) {
            characteristic_uuid = service_uuid.substr(service_uuid.lastIndexOf('.') + 1);
            service_uuid = service_uuid.substr(0, service_uuid.lastIndexOf('.'));
        }

        const service = this.getService(accessory_uuid, service_uuid);
        if (!service) return null;

        return service.characteristics.find(c => c.UUID === characteristic_uuid) || null;
    }

    /**
     * Adds a accessory.
     *
     * @param {PluginAccessory} plugin_accessory
     */
    addAccessory(plugin_accessory: PluginAccessory<boolean>) {
        // eslint-disable-next-line curly
        if (this.accessories.find(a => a.uuid === plugin_accessory.uuid)) throw new Error('Already have an' +
            ' accessory with the UUID "' + plugin_accessory.uuid + '"');

        if (plugin_accessory.accessory) {
            this.registerAccessoryEventListeners(plugin_accessory);
            this.removeCachedAccessory(plugin_accessory.uuid);
        }

        this.accessories.push(plugin_accessory);

        if (plugin_accessory.accessory) {
            this.addAccessoryToBridges(plugin_accessory);
            this.server.emit(AddAccessoryEvent, this.server, plugin_accessory);
        }
    }

    registerAccessoryEventListeners(plugin_accessory: PluginAccessory<true>) {
        // @ts-ignore
        plugin_accessory.accessory.bridged = true;

        const prev_characteristic_change_handler = this.characteristic_change_handlers.get(plugin_accessory.accessory);
        if (prev_characteristic_change_handler) {
            plugin_accessory.accessory.removeListener('service-characteristic-change',
                prev_characteristic_change_handler as any);
        }
        const characteristic_change_handler = this._handleCharacteristicUpdate.bind(this, plugin_accessory.accessory);
        this.characteristic_change_handlers.set(plugin_accessory.accessory, characteristic_change_handler);
        plugin_accessory.accessory.on('service-characteristic-change', characteristic_change_handler);

        const prev_configuration_change_handler = this.configuration_change_handlers.get(plugin_accessory.accessory);
        if (prev_configuration_change_handler) {
            plugin_accessory.accessory.removeListener('service-configurationChange',
                prev_configuration_change_handler as any);
        }
        const configuration_change_handler = this._handleConfigurationChange.bind(this, plugin_accessory.accessory);
        this.configuration_change_handlers.set(plugin_accessory.accessory, configuration_change_handler);
        plugin_accessory.accessory.on('service-configurationChange', configuration_change_handler);
    }

    addAccessoryToBridges(plugin_accessory: PluginAccessory<true>) {
        for (const bridge of this.bridges.filter(bridge => bridge.accessory_uuids.find(accessory_uuid =>
            accessory_uuid instanceof Array ? accessory_uuid[0] === (plugin_accessory.plugin ?
                plugin_accessory.plugin.name : plugin_accessory instanceof HomebridgeAccessory ?
                    'homebridge' : null) &&
                accessory_uuid[1] === (plugin_accessory instanceof PluginStandaloneAccessory ?
                    plugin_accessory.accessory_type : plugin_accessory instanceof PluginAccessoryPlatformAccessory ?
                        plugin_accessory.accessory_platform_name : null) &&
                accessory_uuid[2] === plugin_accessory.accessory!.displayName :
                accessory_uuid === plugin_accessory.uuid
        ))) {
            bridge.addAccessory(plugin_accessory.accessory);
        }
    }

    /**
     * Removes an accessory.
     *
     * @param {PluginAccessory} plugin_accessory
     */
    removeAccessory(plugin_accessory: PluginAccessory) {
        // Emit the destroy event on the accessory - this allows the plugin to disconnect from the accessory properly
        plugin_accessory.destroy();

        const characteristic_change_handler = this.characteristic_change_handlers.get(plugin_accessory.accessory);
        if (characteristic_change_handler) {
            plugin_accessory.accessory.removeListener('service-characteristic-change',
                this._handleCharacteristicUpdate);
        }
        const configuration_change_handler = this.configuration_change_handlers.get(plugin_accessory.accessory) as any;
        if (configuration_change_handler) {
            plugin_accessory.accessory.removeListener('service-configurationChange', configuration_change_handler);
        }

        let index;
        while ((index = this.accessories.findIndex(a => a.uuid === plugin_accessory.uuid)) !== -1) {
            this.accessories.splice(index, 1);
        }

        for (const bridge of this.bridges) {
            if (!bridge.bridge.bridgedAccessories.find(a => a.UUID === plugin_accessory.uuid)) {
                continue;
            }

            bridge.removeAccessory(plugin_accessory.accessory);
        }

        this.server.emit(RemoveAccessoryEvent, this.server, plugin_accessory);
    }

    async loadAccessoriesFromStorage(dont_throw = false) {
        const accessory_uuids: string[] = await this.server.storage.getItem('Accessories') || [];

        return Promise.all(accessory_uuids.map(uuid => this.server.storage.getItem('Accessory.' + uuid)
            .then(async data => {
                switch (data.type) {
                    case AccessoryType.ACCESSORY:
                        return this.loadAccessory(data.config, uuid);
                    case AccessoryType.ACCESSORY_PLATFORM:
                        return this.loadAccessoryPlatform(data.config, uuid);
                    // case AccessoryType.MERGED_ACCESSORY:
                    //     return this.loadMergedAccessory(data.config, uuid);
                    default:
                        throw new Error('Unknown accessory type "' + data.type + '"');
                }
            }).catch(err => {
                this.log.error('Error loading accessory %s:', uuid, err);

                if (!dont_throw) throw err;
            })));
    }

    getAccessoryHandler(config: {
        plugin?: string;
        accessory: string;
    }): [Plugin | null, AccessoryHandler] {
        const {plugin: plugin_name, accessory: accessory_type} = config;

        const {builtin_accessory_types}: typeof import('../accessories') = require('../accessories');

        const is_builtin = !plugin_name && builtin_accessory_types[accessory_type];

        const plugin = is_builtin || !plugin_name ? null : PluginManager.getPlugin(plugin_name);
        if (!plugin && !is_builtin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const accessory_handler = is_builtin ? builtin_accessory_types[accessory_type] :
            plugin!.getAccessoryHandler(accessory_type);
        if (!accessory_handler) throw new Error('No accessory handler with the name "' + accessory_type + '"');

        return [plugin, accessory_handler];
    }

    async loadAccessory(accessory_config: any, uuid?: string) {
        const {plugin: plugin_name, accessory: accessory_type, name} = accessory_config;

        // eslint-disable-next-line curly
        if (!accessory_type || !name) throw new Error('Invalid accessory configuration: accessories must have the' +
            ' plugin, accessory and name properties');

        accessory_config = Object.assign({}, accessory_config);

        if (uuid) accessory_config.uuid = uuid;

        // eslint-disable-next-line curly
        if (!accessory_config.uuid) uuid = accessory_config.uuid = hap.uuid.generate('accessory:' + plugin_name + ':' +
            accessory_type + ':' + name);

        const plugin_accessory = PluginStandaloneAccessory.load(this.server, accessory_config, uuid!);

        this.addAccessory(plugin_accessory);
    }

    getAccessoryPlatformHandler(config: {
        plugin?: string;
        platform: string;
    }): [Plugin | null, typeof AccessoryPlatform] {
        const {plugin: plugin_name, platform: accessory_platform_name} = config;

        const {builtin_accessory_platforms}: typeof import('../accessories') = require('../accessories');

        const is_builtin = !plugin_name && builtin_accessory_platforms[accessory_platform_name];

        const plugin = is_builtin ? null : PluginManager.getPlugin(plugin_name!);
        if (!plugin && !is_builtin) throw new Error('No plugin with the name "' + plugin_name + '"');

        const AccessoryPlatformHandler = is_builtin ? builtin_accessory_platforms[accessory_platform_name] :
            plugin!.getAccessoryPlatformHandler(accessory_platform_name);
        if (!AccessoryPlatformHandler) throw new Error('No accessory platform handler with the name "' + // eslint-disable-line curly
            accessory_platform_name + '"');

        return [plugin, AccessoryPlatformHandler];
    }

    /**
     * Loads an accessory platform.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @return {Promise}
     */
    async loadAccessoryPlatform(config: any, uuid?: string) {
        const {plugin: plugin_name, platform: accessory_platform_name, name} = config;

        // eslint-disable-next-line curly
        if (!accessory_platform_name || !name) throw new Error('Invalid accessory platform configuration: accessory' +
            ' platforms must have the plugin, platform and name properties');

        const [plugin, AccessoryPlatformHandler] = this.getAccessoryPlatformHandler(config);

        config = Object.assign({}, config);

        if (uuid) config.uuid = uuid + ':';
        if (!config.uuid) {
            uuid = config.uuid = 'accessoryplatform:' + plugin_name + ':' + accessory_platform_name + ':' + name;
        }
        if (!util.uuid.validate(uuid!)) uuid = util.uuid.fromString(uuid!);

        // eslint-disable-next-line curly
        if (this.accessory_platforms.find(p => p.uuid === uuid)) throw new Error('Already have an' +
            ' accessory platform with the UUID "' + uuid + '"');

        const cached_accessories = this.getCachedAccessoryPlatformAccessories(config.uuid, plugin,
            accessory_platform_name).map(plugin_accessory => plugin_accessory.accessory);

        const accessory_platform =
            new AccessoryPlatformHandler(plugin!, this.server, uuid!, config, cached_accessories);
        this.accessory_platforms.push(accessory_platform);

        accessory_platform._init();

        return accessory_platform;
    }

    async removeAccessoryPlatform(accessory_platform: AccessoryPlatform | string, cache_accessories = false) {
        if (!(accessory_platform instanceof AccessoryPlatform)) {
            accessory_platform = this.accessory_platforms.find(p => p.uuid === accessory_platform)!;
            if (!accessory_platform) throw new Error('Unknown accessory platform');
        }

        for (const accessory of accessory_platform.accessories) {
            accessory_platform.removeAccessory(accessory.accessory);
            if (cache_accessories) {
                accessory_platform.cached_accessories
                    .push((await this.loadCachedAccessory(accessory.cache())).accessory);
            }
        }
        if (!cache_accessories) accessory_platform.removeAllCachedAccessories();

        // Emit the destroy event on the accessory - this allows the plugin to disconnect from the accessory properly
        accessory_platform.destroy();

        let index;
        while ((index = this.accessory_platforms.indexOf(accessory_platform as AccessoryPlatform)) !== -1) {
            this.accessory_platforms.splice(index, 1);
        }
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

        return plugin_accessory;
    }

    /**
     * Gets a cached accessory.
     *
     * @param {string} uuid
     * @param {Plugin} [plugin]
     * @param {string} [accessory_type]
     * @return {PluginStandaloneAccessory}
     */
    getCachedAccessory(uuid: string, plugin?: Plugin, accessory_type?: string): PluginStandaloneAccessory<true> | null {
        return this.cached_accessories.find(accessory => accessory instanceof PluginStandaloneAccessory &&
            accessory.uuid === uuid &&
            (!plugin || accessory.plugin === plugin) &&
            ((!plugin && !accessory_type) || accessory.accessory_type === accessory_type)
        ) as PluginStandaloneAccessory<true> || null;
    }

    /**
     * Gets a cached accessory from Homebridge.
     *
     * @param {string} uuid
     * @return {HomebridgeAccessory}
     */
    getCachedHomebridgeAccessory(uuid: string): HomebridgeAccessory | null {
        return this.cached_accessories.find(accessory => accessory instanceof HomebridgeAccessory &&
            accessory.uuid === uuid
        ) as HomebridgeAccessory || null;
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
                    accessory.accessory && accessory_uuid[2] === accessory.accessory.displayName);
                if (accessory && accessory.accessory) bridge.addAccessory(accessory.accessory);

                const cached_accessory = this.cached_accessories.find(accessory =>
                    accessory_uuid[0] === (accessory.plugin ? accessory.plugin.name : null) &&
                    // @ts-ignore
                    accessory_uuid[1] === accessory.accessory_type &&
                    accessory_uuid[2] === accessory.accessory.displayName);
                if (cached_accessory) bridge.addCachedAccessory(cached_accessory.accessory);
            } else {
                const accessory = this.accessories.find(accessory => accessory.uuid === accessory_uuid);
                if (accessory && accessory.accessory) bridge.addAccessory(accessory.accessory);

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

    loadHomebridge(
        bridge: HomebridgeBridgeConfiguration, accessories: HomebridgeAccessoryConfiguration[],
        platforms: HomebridgePlatformConfiguration[]
    ) {
        if (this.homebridge) return this.homebridge;

        // config.bridge, config.accessories and config.platforms are for Homebridge
        // If any of these exist, the user wants to run Homebridge as well
        (this as any).homebridge = new Homebridge(this.server, this.log.withPrefix('Homebridge'), {
            bridge, accessories, platforms,
        });

        this.bridges.push(this.homebridge!);

        return this.homebridge!;
    }

    async loadHomebridgeAccessories() {
        if (!this.homebridge) throw new Error('Homebridge not loaded');

        for (const accessory of this.homebridge!.bridge.bridgedAccessories) {
            const plugin_accessory = new HomebridgeAccessory(this.server, accessory);

            this.addAccessory(plugin_accessory);
        }

        for (const platform_accessory of
            Object.values(this.homebridge!.homebridge._publishedAccessories) as PlatformAccessory[]
        ) {
            const plugin_accessory = new HomebridgeAccessory(this.server, platform_accessory._associatedHAPAccessory!,
                platform_accessory);

            this.addAccessory(plugin_accessory);
        }

        this.homebridge!.homebridge._api
            .on('registerPlatformAccessories', this._handleRegisterHomebridgePlatformAccessories);
        this.homebridge!.homebridge._api
            .on('unregisterPlatformAccessories', this._handleUnregisterHomebridgePlatformAccessories);
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
        accessory: Accessory, service: Service, characteristic: Characteristic,
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
        accessory: Accessory, service: Service, characteristic: Characteristic
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

    handleStatusChange(accessory: PluginAccessory, status: AccessoryStatus) {
        this.server.emit(UpdateAccessoryStatusEvent, this.server, accessory, status);

        this.server.sendBroadcast({
            type: 'update-accessory-status',
            uuid: accessory.uuid,
            status,
        });
    }
}

export class AccessoryPlatform {
    readonly plugin!: Plugin;
    readonly server!: Server;
    readonly uuid!: string;
    readonly config!: AccessoryPlatformConfiguration;
    readonly accessories!: PluginAccessoryPlatformAccessory[];
    readonly cached_accessories!: Accessory[];

    private _initialising: Promise<void> | null = null;
    private _initialiseTimeout: NodeJS.Timeout | null = null;
    private _initialiseCallbacks: [() => void, (reason: Error) => void][] | null = [];
    private _reloading: Promise<void> | null = null;
    private _nextConfiguration: any = null;
    private _reloadTimeout: NodeJS.Timeout | null = null;
    private _reloadCallbacks: [() => void, (reason: Error) => void][] | null = null;
    private _destroyed = false;

    /**
     * Creates an AccessoryPlatform.
     *
     * @param {Plugin} plugin
     * @param {Server} server
     * @param {string} uuid
     * @param {object} config
     * @param {Array} cached_accessories
     */
    constructor(
        plugin: Plugin, server: Server, uuid: string, config: AccessoryPlatformConfiguration,
        cached_accessories: Accessory[]
    ) {
        Object.defineProperty(this, 'plugin', {value: plugin});
        Object.defineProperty(this, 'server', {value: server});
        Object.defineProperty(this, 'uuid', {value: uuid});
        Object.defineProperty(this, 'config', {configurable: true, value: Object.freeze(config)});
        Object.defineProperty(this, 'accessories', {value: []});
        Object.defineProperty(this, 'cached_accessories', {value: cached_accessories});
    }

    static withHandler(handler: AccessoryPlatformHandler): typeof AccessoryPlatform {
        return class extends AccessoryPlatform {
            async init(cached_accessories: Accessory[]) {
                const accessories = await handler.call(this.plugin, this.config, cached_accessories);

                this.addAccessory(...accessories);
                this.removeAllCachedAccessories();
            }
        };
    }

    static withDynamicHandler(handler: DynamicAccessoryPlatformHandler): typeof AccessoryPlatform {
        return class extends AccessoryPlatform {
            async init(cached_accessories: Accessory[]) {
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
    async init(cached_accessories: Accessory[]) {
        this.addAccessory(...cached_accessories);
    }

    /**
     * Internal method to initialise the accessory platform.
     *
     * @return {Promise<void>}
     */
    _init() {
        if (!this._initialiseCallbacks || this._destroyed) return Promise.resolve();
        if (this._initialising) return this._initialising;

        clearTimeout(this._initialiseTimeout!);
        this._initialiseTimeout = null;

        // Call the accessory handler
        const init = Promise.resolve().then(() => this.init(this.cached_accessories));

        return this._initialising = init.then(() => {
            if (this._initialiseCallbacks) for (const [callback] of this._initialiseCallbacks) callback();

            this._initialising = null;
            this._initialiseCallbacks = null;
        }).catch(err => {
            // Accessory platform handler threw
            this._initialising = null;

            this.server.accessories.log.error('Error loading accessory platform %s (will try again in 30 seconds):',
                this.uuid, err);

            this._initialiseTimeout = setTimeout(() => this._init(), 30000);
        });
    }

    /**
     * Called when the accessory platform is removed from the server.
     * At this point all accessories from this accessory platform have already been removed from the server.
     * Plugins should override this method.
     *
     * @param {any} config
     */
    onreload(config: any) {
        throw new Error('Accessory platform didn\'t handle reload event');
    }

    /**
     * Internal method to reload the accessory platform's configuration.
     *
     * @param {any} config
     * @return {Promise<void>}
     */
    reload(config: any) {
        if (this._destroyed) return Promise.reject(new Error('Canceled'));
        if (!this._reloading && !this._initialising && this._initialiseCallbacks) {
            // Not started initialising yet
            Object.defineProperty(this, 'config', {configurable: true, value: Object.freeze(config)});
            this._init();
            return Promise.resolve();
        }
        if (this._reloading && this._nextConfiguration === config) return this._reloading;

        this._nextConfiguration = config;

        if (!this._reloadCallbacks) this._reloadCallbacks = [];

        const reloading = this._reloading = (
            this._reloading?.catch(err => {}) ||
            this._initialising?.catch(err => {}) ||
            Promise.resolve()
        ).then(() => {
            if (this._nextConfiguration !== config) return;
            this._reloading = reloading;

            const reload = Promise.resolve().then(() => this.onreload(config));

            return reload.then(() => {
                if (this._nextConfiguration !== config) return;

                if (this._reloadCallbacks) for (const [callback] of this._reloadCallbacks) callback();

                this._reloading = null;
                this._reloadCallbacks = null;
            }).catch(err => {
                this.server.accessories.log.error('Error reloading accessory platform %s configuration' +
                    ' (will try again in 30 seconds):', this.uuid, err);

                if (this._nextConfiguration !== config) return;

                this._reloadTimeout = setTimeout(() => this.reload(config), 30000);
            });
        });

        return reloading;
    }

    /**
     * Called when the accessory platform is removed from the server.
     * At this point all accessories from this accessory platform have already been removed from the server.
     */
    async ondestroy() {
        throw new Error('Accessory platform didn\'t handle destroy event');
    }

    /**
     * Internal method called when the accessory platform's configuration.
     *
     * @return {Promise}
     */
    destroy() {
        this._destroyed = true;

        clearTimeout(this._initialiseTimeout!);
        this._initialiseTimeout = null;
        clearTimeout(this._reloadTimeout!);
        this._reloadTimeout = null;

        const err = new Error('Canceled');
        if (this._initialiseCallbacks) for (const [rs, rj] of this._initialiseCallbacks) rj(err);
        this._initialiseCallbacks = null;
        if (this._reloadCallbacks) for (const [rs, rj] of this._reloadCallbacks) rj(err);
        this._reloadCallbacks = null;
        this._nextConfiguration = null;

        if (!this._initialising) return this.ondestroy();

        // If we're still initialising the accessory platform wait for it first
        return this._initialising.catch(err => {}).then(() => this.ondestroy());
    }

    /**
     * Adds an accessory.
     * This will automatically remove it from the cached accessories.
     *
     * @param {Accessory} accessory
     */
    addAccessory(...accessories: Accessory[]) {
        for (const accessory of accessories) {
            const plugin_accessory = new PluginAccessoryPlatformAccessory(this.server, accessory, this.plugin,
                this, this.config.uuid!);

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
    removeAccessory(...accessories: Accessory[]) {
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

export class PluginAccessory<HasAccessory extends boolean = true> {
    static readonly symbol = Symbol('PluginAccessory');

    readonly server!: Server;
    readonly uuid!: string;
    readonly accessory!: HasAccessory extends true ? Accessory : null;
    readonly plugin!: Plugin | null;
    readonly data: any;
    readonly cached_data: any;

    protected _status = AccessoryStatus.NOT_READY;

    constructor(
        server: Server, accessory: HasAccessory extends true ? Accessory : string, plugin: Plugin | null, data?: any
    ) {
        Object.defineProperty(this, 'server', {value: server});
        Object.defineProperty(this, 'accessory', {configurable: true, value:
            accessory instanceof Accessory ? accessory : null});
        Object.defineProperty(this, 'plugin', {value: plugin});
        this.data = data;

        if (this.accessory) {
            Object.defineProperty(this, 'uuid', {value: this.accessory.UUID});
            Object.defineProperty(this.accessory, PluginAccessory.symbol, {value: this});

            this.accessory.on(AccessoryEvents.STATUS, this._handleUpdateStatus);
        } else {
            Object.defineProperty(this, 'uuid', {value: accessory});
        }
    }

    get status() {
        return this._status;
    }

    destroy() {
        if (this.accessory!.listenerCount(AccessoryEvents.DESTROY) <= 0) {
            this.server.log.warn('Accessory %s doesn\'t have a destory handler', this.uuid);
        }

        this._status = AccessoryStatus.DESTROYED;
        this.accessory!.emit(AccessoryEvents.DESTROY);
    }

    protected updateStatus(status: AccessoryStatus) {
        // Check status is a valid status
        if (typeof AccessoryStatus[status] !== 'string') return;

        // Disallow setting the status to WAITING and DESTROYED
        if (status === AccessoryStatus.WAITING) return;
        if (status === AccessoryStatus.DESTROYED) return;

        // Don't allow updating the status if the accessory has been removed from the server
        if (this.status === AccessoryStatus.DESTROYED) return;

        this._status = status;

        this.server.accessories.handleStatusChange(this as PluginAccessory<true>, status);
    }

    // eslint-disable-next-line no-invalid-this
    private _handleUpdateStatus = this.updateStatus.bind(this);

    /**
     * Return an object that can be used to recreate this accessory.
     *
     * @return {object}
     */
    cache() {
        // If the accessory hasn't been initialised yet use old cache data
        if (!this.accessory) return this.cached_data;

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
            plugin: this.plugin ? this.plugin.name || this.plugin.path : null,
            uuid: this.uuid,
            is_homebridge: this instanceof HomebridgeAccessory,
            accessory_type: (this as any as PluginStandaloneAccessory).accessory_type,
            base_uuid: (this as any as PluginAccessoryPlatformAccessory).base_uuid,
            accessory_platform: (this as any as PluginAccessoryPlatformAccessory).accessory_platform_name,
            data: this.data,
            bridge_uuids: this.server.accessories.bridges
                .filter(b => b.accessory_uuids.includes(this.accessory!.UUID)).map(b => b.uuid),
            bridge_uuids_external: this.server.accessories.bridges
                .filter(b => b.accessory_uuids.includes(this.accessory!.UUID) &&
                    b.external_accessories.find(a => a.UUID === this.accessory!.UUID)).map(b => b.uuid),
        };
    }

    /**
     * Create an accessory from cached data.
     *
     * @param {Server} server
     * @param {object} cache The cached data returned from pluginaccessory.cache
     * @return {PluginAccessory}
     */
    static restore(server: Server, cache: any): PluginAccessory<true> {
        const accessory = new Accessory(cache.accessory.displayName, cache.accessory.UUID);

        // @ts-ignore
        accessory.services = cache.accessory.services.map((service_cache: any) => {
            const service = new Service(service_cache.displayName, service_cache.UUID, service_cache.subtype);

            // @ts-ignore
            service.characteristics = service_cache.characteristics.map((characteristic_cache: any) => {
                const characteristic = new Characteristic(characteristic_cache.displayName, characteristic_cache.UUID,
                    characteristic_cache.props);

                // @ts-ignore
                characteristic.value = characteristic_cache.value;
                // @ts-ignore
                characteristic.status = characteristic_cache.status;
                // @ts-ignore
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
            new PluginStandaloneAccessory<true>(server, accessory, plugin, cache.accessory_type, null, cache.uuid);

        // @ts-ignore
        plugin_accessory.cached_data = cache;

        return plugin_accessory;
    }
}

const AccessoryEvents_destroy = Symbol('destroy');
const AccessoryEvents_reload = Symbol('reload');
const AccessoryEvents_status = Symbol('status');

export const AccessoryEvents: {
    readonly DESTROY: typeof AccessoryEvents_destroy;
    readonly RELOAD: typeof AccessoryEvents_reload;
    readonly STATUS: typeof AccessoryEvents_status;
} = {
    DESTROY: AccessoryEvents_destroy,
    RELOAD: AccessoryEvents_reload,
    STATUS: AccessoryEvents_status,
};

export type AccessoryEvents = typeof AccessoryEvents[keyof typeof AccessoryEvents];

declare module 'hap-nodejs/lib/Accessory' {
    interface Events {
        [AccessoryEvents.DESTROY]: [];
        [AccessoryEvents.RELOAD]: [any];
        [AccessoryEvents.STATUS]: [AccessoryStatus];
    }

    export interface Accessory {
        [PluginAccessory.symbol]?: PluginAccessory;
    }
}

export class PluginStandaloneAccessory<HasAccessory extends boolean = boolean> extends PluginAccessory<HasAccessory> {
    readonly config: any;
    readonly uuid!: string;
    readonly accessory_type!: string;

    private _initialising: Promise<void> | null = null;
    private _initialiseTimeout: NodeJS.Timeout | null = null;
    private _initialiseCallbacks: [() => void, (reason: Error) => void][] | null = [];

    constructor(
        server: Server, accessory: HasAccessory extends true ? Accessory : null,
        plugin: Plugin | null, accessory_type: string, config: any, uuid: string
    ) {
        super(server, accessory ? accessory : uuid as any, plugin);

        Object.defineProperty(this, 'config', {value: config});
        Object.defineProperty(this, 'accessory_type', {value: accessory_type});
    }

    get ready(): Promise<PluginStandaloneAccessory<true> & this> {
        return this._initialiseCallbacks ? new Promise((rs, rj) =>
            this._initialiseCallbacks?.push([() => rs(this as any), rj])) :
            Promise.resolve(this as any);
    }

    static load(server: Server, config: any, uuid: string) {
        const [plugin, accessory_handler] = server.accessories.getAccessoryHandler(config);
        const type: string = config.accessory;

        const plugin_accessory = new PluginStandaloneAccessory<false>(server, null, plugin, type, config, uuid);

        const cached_accessory = server.accessories.getCachedAccessory(uuid);
        // @ts-ignore
        if (cached_accessory) plugin_accessory.cached_data = cached_accessory.cached_data;

        // Try and initialise the accessory now
        plugin_accessory.init(server, plugin, accessory_handler, cached_accessory, uuid, config);

        return plugin_accessory;
    }

    /**
     * Reload the accessory's configuration.
     * This does not provide the same safety as accessory platforms, where the reload handler will only be called once
     * at a time.
     *
     * @param {any} config
     */
    reload(config: any) {
        if (this.accessory) {
            this.accessory.emit(AccessoryEvents.RELOAD, config);
            return;
        }

        // If we're still initialising the accessory wait for it first
        if (this._initialising) {
            this._initialising.catch(err => {}).then(() => this.accessory!.emit(AccessoryEvents.RELOAD, config));
        }

        // If we're not initialised and we haven't tried yet we don't need to do anything
    }

    destroy() {
        clearTimeout(this._initialiseTimeout!);
        this._initialiseTimeout = null;

        const err = new Error('Canceled');
        if (this._initialiseCallbacks) for (const [rs, rj] of this._initialiseCallbacks) rj(err);
        this._initialiseCallbacks = null;

        if (!this._initialising) return super.destroy();

        // If we're still initialising the accessory wait for it first
        this._initialising.catch(err => {}).then(() => super.destroy());
    }

    private init(
        server: Server, plugin: Plugin | null, accessory_handler: AccessoryHandler,
        cached_accessory: PluginStandaloneAccessory<true> | null, uuid: string, config: any
    ) {
        if (this.accessory) return Promise.resolve();
        if (this._initialising) return this._initialising;

        clearTimeout(this._initialiseTimeout!);
        this._initialiseTimeout = null;

        // Call the accessory handler
        const init = Promise.resolve().then(() =>
            accessory_handler.call(plugin, config, cached_accessory ? cached_accessory.accessory : undefined));

        this._status = AccessoryStatus.WAITING;
        this.server.accessories.handleStatusChange(this as PluginAccessory<true>, AccessoryStatus.WAITING);

        this._initialising = init.then(accessory => {
            if (!(accessory instanceof Accessory)) throw new Error('Accessory handler didn\'t return an Accessory');

            // Set the accessory
            Object.defineProperty(this, 'accessory', {value: accessory});
            Object.defineProperty(this.accessory, PluginAccessory.symbol, {value: this});

            server.accessories.registerAccessoryEventListeners(this as PluginStandaloneAccessory<true>);
            server.accessories.removeCachedAccessory(this.uuid);
            server.accessories.addAccessoryToBridges(this as PluginStandaloneAccessory<true>);

            if (this.status === AccessoryStatus.WAITING) this.updateStatus(AccessoryStatus.READY);

            if (this._initialiseCallbacks) for (const [callback] of this._initialiseCallbacks) callback();
            this._initialising = null;
            this._initialiseCallbacks = null;

            this.server.emit(AddAccessoryEvent, this.server, this as PluginStandaloneAccessory<true>);
        }).catch(err => {
            // Accessory handler threw
            // Set the status to ERROR
            this.updateStatus(AccessoryStatus.ERROR);
            this._initialising = null;

            server.accessories.log.error('Error loading accessory %s (will try again in 30 seconds):', uuid, err);

            this._initialiseTimeout = setTimeout(() =>
                this.init(server, plugin, accessory_handler, cached_accessory, uuid, config), 30000);
        });
    }
}

export class PluginAccessoryPlatformAccessory extends PluginAccessory<true> {
    readonly base_uuid!: string;
    readonly accessory_platform!: AccessoryPlatform | null;
    readonly accessory_platform_name!: string;

    constructor(
        server: Server, accessory: Accessory, plugin: Plugin | null, accessory_platform: AccessoryPlatform | string,
        base_uuid: string
    ) {
        super(server, accessory, plugin);

        Object.defineProperty(this, 'base_uuid', {value: base_uuid});
        Object.defineProperty(this, 'accessory_platform', {value: accessory_platform});
        Object.defineProperty(this, 'accessory_platform_name', {value: accessory_platform instanceof AccessoryPlatform ?
            accessory_platform.constructor.name : accessory_platform});

        this.updateStatus(AccessoryStatus.READY);
    }
}

export class HomebridgeAccessory extends PluginAccessory<true> {
    readonly platform_accessory!: PlatformAccessory;

    constructor(server: Server, accessory: Accessory, platform_accessory?: PlatformAccessory) {
        super(server, accessory, null);

        Object.defineProperty(this, 'platform_accessory', {value: platform_accessory});

        this.updateStatus(AccessoryStatus.READY);
    }
}
