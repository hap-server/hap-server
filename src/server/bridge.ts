/// <reference path="../types/qrcode-terminal.d.ts" />

import * as os from 'os';
import * as crypto from 'crypto';
import chalk from 'chalk';
import * as qrcode from 'qrcode-terminal';
import {Bridge as HAPBridge, Accessory, Service, Characteristic, Categories as Category} from 'hap-nodejs';
import HAPServer from './hap-server';

import {AccessoryInfo} from 'hap-nodejs/dist/lib/model/AccessoryInfo';
import {IdentifierCache} from 'hap-nodejs/dist/lib/model/IdentifierCache';

import Server from './server';
import {PluginAccessory} from './accessories';
import Logger from '../common/logger';

const ExternalAccessory = Symbol('ExternalAccessory');
const ExternalAccessoryGroups = Symbol('ExternalAccessoryGroups');

export {
    ExternalAccessory as ExternalAccessorySymbol,
    ExternalAccessoryGroups as ExternalAccessoryGroupsSymbol,
};

declare module 'hap-nodejs/dist/lib/Accessory' {
    interface Accessory {
        [ExternalAccessory]?: boolean;
        [ExternalAccessoryGroups]?: string[];
    }
}

const hapserver_eventhandlers = Symbol('__hap_server_eventhandlers');

declare module 'hap-nodejs/dist/lib/Bridge' {
    interface Bridge {
        [hapserver_eventhandlers]?: WeakMap<any, {
            characteristic_change?: any;
            configuration_change?: any;
        }>;
    }
}

export default class Bridge {
    readonly server: Server;
    readonly log: Logger;

    config: any;
    readonly uuid: string;
    readonly name: string;
    readonly username: string;
    readonly port: number;
    readonly pincode: string;
    unauthenticated_access: boolean;

    accessory_uuids: (string | [string | null, string, string] | ['homebridge', null, string])[];
    readonly external_accessories: Accessory[];
    readonly external_accessory_accessory_infos: Map<Accessory, AccessoryInfo>;
    readonly external_accessory_identifier_caches: Map<Accessory, IdentifierCache>;
    readonly external_accessory_servers: Map<Accessory, HAPServer>;
    readonly cached_accessories: Accessory[];

    bridge: HAPBridge;
    _handleCharacteristicUpdate: any;
    _configuration_update_timeout: NodeJS.Timeout | null = null;

    constructor(server: Server, log: Logger, config: any) {
        this.server = server;
        this.log = log;

        if (!config || !config.uuid) {
            throw new Error('No UUID specified in bridge configuration');
        }

        this.config = config.config;
        this.uuid = config.uuid;
        this.name = config.name || os.hostname();
        this.username = config.username || 'CC:22:3D:E3:CE:30';
        this.port = config.port || 0;
        this.pincode = config.pincode || '031-45-154',
        this.unauthenticated_access = config.unauthenticated_access || false;

        this.accessory_uuids = config.accessory_uuids || [];
        this.external_accessories = [];
        this.external_accessory_accessory_infos = new Map(); // Maps Accessory objects to AccessoryInfo objects
        this.external_accessory_identifier_caches = new Map(); // Maps Accessory objects to IdentifierCache objects
        this.external_accessory_servers = new Map(); // Maps Accessory objects to HAPServer objects
        this.cached_accessories = [];

        this.bridge = this._createBridge(config);

        this.bridge.on('listening', (port: number) => {
            this.log.info(`${this.name} is running on port ${port}`);
            Object.freeze(this);
        });

        this._handleCharacteristicUpdate =
            this.server.accessories._handleCharacteristicUpdate.bind(this.server, this.bridge);
        this.bridge.on('service-characteristic-change', this._handleCharacteristicUpdate);
    }

    protected _createBridge(config: any) {
        const bridge = new HAPBridge(this.name, this.uuid);

        // @ts-ignore
        bridge.on('hap-server-update-pairings', () => this.server.accessories.handlePairingsUpdate(this));

        // @ts-ignore
        bridge.addBridgedAccessory = this._addBridgedAccessory.bind(this, bridge);
        bridge.removeBridgedAccessory = this._removeBridgedAccessory.bind(this, bridge);
        // @ts-expect-error
        bridge.enqueueConfigurationUpdate = this.enqueueConfigurationUpdate.bind(this, bridge, false);

        bridge.getService(Service.AccessoryInformation)!
            .setCharacteristic(Characteristic.Manufacturer, 'Samuel Elliott')
            .setCharacteristic(Characteristic.Model, require('..').package_json.name)
            .setCharacteristic(Characteristic.SerialNumber, this.username)
            .setCharacteristic(Characteristic.FirmwareRevision, require('..').version)
            .setCharacteristic(Characteristic.HardwareRevision, os.hostname());

        return bridge;
    }

    private _addBridgedAccessory(bridge: HAPBridge, accessory: Accessory, defer_update = false) {
        // @ts-ignore
        if (accessory._isBridge) throw new Error('Cannot Bridge another Bridge!');

        // Check for UUID conflict
        for (const existing of bridge.bridgedAccessories) {
            if (existing.UUID === accessory.UUID) throw new Error('Cannot add a bridged Accessory with the same' + // eslint-disable-line curly
                ' UUID as another bridged Accessory: ' + existing.UUID);
        }
        for (const existing of this.external_accessories) {
            if (existing.UUID === accessory.UUID) throw new Error('Cannot add a bridged Accessory with the same' + // eslint-disable-line curly
                ' UUID as another external Accessory: ' + existing.UUID);
        }

        const _eventhandlers = bridge[hapserver_eventhandlers] || (bridge[hapserver_eventhandlers] = new WeakMap());
        let eventhandlers = _eventhandlers.get(accessory);
        if (!eventhandlers) _eventhandlers.set(accessory, eventhandlers = {});

        if (!eventhandlers.characteristic_change) eventhandlers.characteristic_change = (change: any) => { // eslint-disable-line curly
            // @ts-expect-error
            bridge.handleCharacteristicChangeEvent(accessory, change.service, change);
        };
        if (!eventhandlers.configuration_change) eventhandlers.configuration_change = (change: any) => { // eslint-disable-line curly
            // @ts-ignore
            bridge.enqueueConfigurationUpdate();
        };

        accessory.on('service-characteristic-change', eventhandlers.characteristic_change);
        accessory.on('service-configurationChange', eventhandlers.configuration_change);

        // @ts-ignore
        accessory.bridged = true;
        bridge.bridgedAccessories.push(accessory);

        // @ts-ignore
        if (!defer_update) bridge.enqueueConfigurationUpdate();

        return accessory;
    }

    private _removeBridgedAccessory(bridge: HAPBridge, accessory: Accessory, defer_update = false) {
        const index = bridge.bridgedAccessories.findIndex(a => a.UUID === accessory.UUID);
        if (index <= -1) throw new Error('Cannot find the bridged Accessory to remove.');

        const existing = bridge.bridgedAccessories[index];
        bridge.bridgedAccessories.splice(index, 1);

        this._removeBridgedAccessoryEventListeners(bridge, existing);

        // @ts-ignore
        if (!defer_update) bridge.enqueueConfigurationUpdate();
    }

    private _removeBridgedAccessoryEventListeners(bridge: HAPBridge, accessory: Accessory) {
        if (!bridge[hapserver_eventhandlers]) return;
        const eventhandlers = bridge[hapserver_eventhandlers]!.get(accessory);
        if (!eventhandlers) return;

        if (eventhandlers.characteristic_change) {
            accessory.removeListener('service-characteristic-change', eventhandlers.characteristic_change);
            delete eventhandlers.characteristic_change;
        }
        if (eventhandlers.configuration_change) {
            accessory.removeListener('service-configurationChange', eventhandlers.configuration_change);
            delete eventhandlers.configuration_change;
        }
    }

    private enqueueConfigurationUpdate(bridge: HAPBridge, dont_update_advertisement = false) {
        if (this._configuration_update_timeout) return;

        this.log.debug('Maybe update configuration for bridge', bridge.UUID);

        if (!dont_update_advertisement && (!this.hasOwnProperty('hap_server') ||
            !this.hasOwnProperty('accessory_info') || !this.hap_server.is_advertising)) return;

        this.log.debug('Updating configuration for bridge', bridge.UUID);

        this._configuration_update_timeout = setTimeout(() => {
            this._configuration_update_timeout = null;

            if (this.hasOwnProperty('hap_server') && this.hap_server.advertiser) {
                // @ts-expect-error
                const config = this.bridge.internalHAPRepresentation();
                if (this.accessory_info.checkForCurrentConfigurationNumberIncrement(config)) {
                    this.hap_server.updateAdvertisement();
                }
            }
        }, 1000);
        this._configuration_update_timeout.unref();
    }

    publish() {
        this.hap_server.start();

        for (const accessory of this.external_accessories) {
            const hap_server = this.getExternalAccessoryServer(accessory);

            hap_server.start();
        }
    }

    unpublish() {
        if (this.hasOwnProperty('hap_server')) this.hap_server.stop();

        for (const accessory of this.external_accessories) {
            const hap_server = this.external_accessory_servers.get(accessory);
            if (!hap_server) continue;

            hap_server.stop();
        }
    }

    get accessory_info(): AccessoryInfo {
        // Attempt to load existing AccessoryInfo from disk
        let accessory_info = AccessoryInfo.load(this.username);

        // If we don't have one, create a new one
        if (!accessory_info) {
            this.log.debug('Creating new AccessoryInfo');
            accessory_info = AccessoryInfo.create(this.username);
        }

        if (accessory_info.setupID === undefined || accessory_info.setupID === '') {
            // @ts-ignore
            this.bridge._setupID = this.bridge._generateSetupID();
        } else {
            // @ts-ignore
            this.bridge._setupID = accessory_info.setupID;
        }

        // @ts-ignore
        accessory_info.setupID = this.bridge._setupID;

        // Make sure we have up-to-date values in AccessoryInfo, then save it in case they changed (or if we just created it)
        accessory_info.displayName = this.name;
        accessory_info.category = Category.BRIDGE;
        accessory_info.pincode = this.pincode;
        accessory_info.save();

        return Object.defineProperty(this, 'accessory_info', {value: accessory_info}).accessory_info;
    }

    get identifier_cache(): IdentifierCache {
        // Create our IdentifierCache so we can provide clients with stable aid/iid's
        let identifier_cache = IdentifierCache.load(this.username);

        // If we don't have one, create a new one
        if (!identifier_cache) {
            this.log.debug('Creating new IdentifierCache');
            identifier_cache = new IdentifierCache(this.username);
        }

        return Object.defineProperty(this, 'identifier_cache', {value: identifier_cache}).identifier_cache;
    }

    get hap_server(): HAPServer {
        // Create our HAP server which handles all communication between iOS devices and us
        const hap_server = new HAPServer(this.bridge, {
            port: this.port,
            unauthenticated_access: this.unauthenticated_access,
            hostname: this.server.hostname,
        }, this.log.withPrefix('Server'), this.accessory_info, this.identifier_cache);

        return Object.defineProperty(this, 'hap_server', {value: hap_server}).hap_server;
    }

    addExternalAccessory(accessory: Accessory) {
        // Check for UUID conflict
        for (const existing of this.bridge.bridgedAccessories) {
            if (existing.UUID === accessory.UUID) throw new Error('Cannot add an external Accessory with the same' + // eslint-disable-line curly
                ' UUID as another bridged Accessory: ' + existing.UUID);
        }
        for (const existing of this.external_accessories) {
            if (existing.UUID === accessory.UUID) throw new Error('Cannot add an external Accessory with the same' + // eslint-disable-line curly
                ' UUID as another external Accessory: ' + existing.UUID);
        }

        this.external_accessories.push(accessory);

        return accessory;
    }

    static generateExternalAccessoryUsername(bridge_username: string, accessory_uuid: string) {
        const sha1sum = crypto.createHash('sha1');
        sha1sum.update(bridge_username + '-' + accessory_uuid);
        const s = sha1sum.digest('hex');
        let i = 0;
        return `${bridge_username.substr(0, 8)}:xx:xx:xx`.replace(/[x]/g, x => s[i++]);
    }

    static getExternalAccessoryCategory(accessory: Accessory): Category {
        if (accessory.category !== Category.OTHER) return accessory.category;

        if (accessory._isBridge) return Category.BRIDGE;

        if (accessory.services.find(s => s.UUID === Service.Fan.UUID)) return Category.FAN;
        if (accessory.services.find(s =>
            s.UUID === Service.GarageDoorOpener.UUID)) return Category.GARAGE_DOOR_OPENER;
        if (accessory.services.find(s => s.UUID === Service.Lightbulb.UUID)) return Category.LIGHTBULB;
        if (accessory.services.find(s => s.UUID === Service.LockMechanism.UUID)) return Category.DOOR_LOCK;
        if (accessory.services.find(s => s.UUID === Service.Outlet.UUID)) return Category.OUTLET;
        if (accessory.services.find(s => s.UUID === Service.Switch.UUID)) return Category.SWITCH;
        if (accessory.services.find(s => s.UUID === Service.Thermostat.UUID)) return Category.THERMOSTAT;
        if (accessory.services.find(s => s.UUID === Service.AirQualitySensor.UUID ||
            s.UUID === Service.CarbonDioxideSensor.UUID ||
            s.UUID === Service.CarbonMonoxideSensor.UUID ||
            s.UUID === Service.ContactSensor.UUID ||
            s.UUID === Service.LeakSensor.UUID ||
            s.UUID === Service.LightSensor.UUID ||
            s.UUID === Service.MotionSensor.UUID ||
            s.UUID === Service.OccupancySensor.UUID ||
            s.UUID === Service.SmokeSensor.UUID ||
            s.UUID === Service.TemperatureSensor.UUID ||
            s.UUID === Service.AirQualitySensor.UUID)) return Category.SENSOR;
        if (accessory.services.find(s =>
            s.UUID === Service.SecuritySystem.UUID)) return Category.SECURITY_SYSTEM;
        if (accessory.services.find(s => s.UUID === Service.Door.UUID)) return Category.DOOR;
        if (accessory.services.find(s => s.UUID === Service.Window.UUID)) return Category.WINDOW;
        if (accessory.services.find(s =>
            s.UUID === Service.WindowCovering.UUID)) return Category.WINDOW_COVERING;
        if (accessory.services.find(s =>
            s.UUID === Service.StatelessProgrammableSwitch.UUID)) return Category.PROGRAMMABLE_SWITCH;
        // if (accessory.cameraSource && accessory.services.find(s =>
        //     s.UUID === Service.Doorbell.UUID)) return Accessory.Categories.VIDEO_DOORBELL;
        // if (accessory.cameraSource) return Accessory.Categories.IP_CAMERA;
        if (accessory.services.find(s => s.UUID === Service.AirPurifier.UUID)) return Category.AIR_PURIFIER;
        if (accessory.services.find(s => s.UUID === Service.Television.UUID)) return Category.TELEVISION;
        if (accessory.services.find(s => s.UUID === Service.Speaker.UUID)) return Category.SPEAKER;
        if (accessory.services.find(s => s.UUID === Service.Valve.UUID &&
            s.getCharacteristic(Characteristic.ValveType).value === Characteristic.ValveType.IRRIGATION
        )) return Category.SPRINKLER;
        if (accessory.services.find(s => s.UUID === Service.Faucet.UUID || (s.UUID === Service.Valve.UUID &&
            s.getCharacteristic(Characteristic.ValveType).value === Characteristic.ValveType.WATER_FAUCET)
        )) return Category.FAUCET;
        if (accessory.services.find(s => s.UUID === Service.Valve.UUID &&
            s.getCharacteristic(Characteristic.ValveType).value === Characteristic.ValveType.SHOWER_HEAD
        )) return Category.SHOWER_HEAD;

        return Category.OTHER;
    }

    getExternalAccessoryAccessoryInfo(accessory: Accessory): AccessoryInfo {
        if (!this.external_accessories.includes(accessory)) {
            throw new Error('Unknown external accessory');
        }

        if (this.external_accessory_accessory_infos.has(accessory)) {
            return this.external_accessory_accessory_infos.get(accessory)!;
        }

        const username = (this.constructor as typeof Bridge)
            .generateExternalAccessoryUsername(this.username, accessory.UUID);

        // Attempt to load existing AccessoryInfo from disk
        let accessory_info = AccessoryInfo.load(username);

        // If we don't have one, create a new one
        if (!accessory_info) {
            this.log.debug('Creating new AccessoryInfo for external accessory %s (UUID %s)',
                accessory.displayName, accessory.UUID);
            accessory_info = AccessoryInfo.create(username);
        }

        if (accessory_info.setupID === undefined || accessory_info.setupID === '') {
            // @ts-expect-error
            accessory._setupID = Accessory._generateSetupID();
        } else {
            accessory._setupID = accessory_info.setupID;
        }

        accessory_info.setupID = accessory._setupID!;

        // Make sure we have up-to-date values in AccessoryInfo, then save it in case they changed (or if we just created it)
        accessory_info.displayName = this.name + ' ' + accessory.displayName;
        accessory_info.category = (this.constructor as typeof Bridge).getExternalAccessoryCategory(accessory);
        accessory_info.pincode = this.pincode;
        accessory_info.save();

        this.external_accessory_accessory_infos.set(accessory, accessory_info);
        return accessory_info;
    }

    getExternalAccessoryIdentifierCache(accessory: Accessory): IdentifierCache {
        if (!this.external_accessories.includes(accessory)) {
            throw new Error('Unknown external accessory');
        }

        if (this.external_accessory_identifier_caches.has(accessory)) {
            return this.external_accessory_identifier_caches.get(accessory)!;
        }

        const username = (this.constructor as typeof Bridge)
            .generateExternalAccessoryUsername(this.username, accessory.UUID);

        // Create our IdentifierCache so we can provide clients with stable aid/iid's
        let identifier_cache = IdentifierCache.load(username);

        // If we don't have one, create a new one
        if (!identifier_cache) {
            this.log.debug('Creating new IdentifierCache for external accessory %s (UUID %s)',
                accessory.displayName, accessory.UUID);
            identifier_cache = new IdentifierCache(username);
        }

        this.external_accessory_identifier_caches.set(accessory, identifier_cache);
        return identifier_cache;
    }

    getExternalAccessoryServer(accessory: Accessory) {
        if (!this.external_accessories.includes(accessory)) {
            throw new Error('Unknown external accessory');
        }

        if (this.external_accessory_servers.has(accessory)) {
            return this.external_accessory_servers.get(accessory)!;
        }

        // Create our HAP server which handles all communication between iOS devices and us
        const hap_server = new HAPServer(
            accessory, {
                port: this.port,
                unauthenticated_access: this.unauthenticated_access,
            },
            this.log.withPrefix('External ' + accessory.displayName, 'Server'),
            this.getExternalAccessoryAccessoryInfo(accessory),
            this.getExternalAccessoryIdentifierCache(accessory)
        );

        Object.defineProperty(hap_server, 'require_first_pairing', {get: () => {
            return Object.keys(this.accessory_info.pairedClients)[0] || true;
        }});
        Object.defineProperty(hap_server, 'allowed_pairings', {get: () => {
            return Object.keys(this.accessory_info.pairedClients);
        }});

        this.external_accessory_servers.set(accessory, hap_server);
        return hap_server;
    }

    expireExternalAccessoryUnusedIDs(accessory: Accessory) {
        if (!this.external_accessory_identifier_caches.has(accessory) ||
            !this.external_accessory_servers.has(accessory)) return;

        const identifier_cache = this.external_accessory_identifier_caches.get(accessory)!;
        const hap_server = this.external_accessory_servers.get(accessory)!;

        identifier_cache.startTrackingUsage();

        hap_server.accessoryToHAP(accessory);
        for (const a of accessory.bridgedAccessories) hap_server.accessoryToHAP(a);

        identifier_cache.stopTrackingUsageAndExpireUnused();
        identifier_cache.save();
    }

    removeExternalAccessory(accessory: Accessory) {
        const index = this.external_accessories.findIndex(a => a.UUID === accessory.UUID);
        if (index <= -1) throw new Error('Cannot find the external Accessory to remove.');

        const existing = this.external_accessories[index];
        this.external_accessories.splice(index, 1);

        const hap_server = this.external_accessory_servers.get(existing);

        if (hap_server) {
            hap_server.stop();
        }

        this.external_accessory_accessory_infos.delete(existing);
        this.external_accessory_identifier_caches.delete(existing);
        this.external_accessory_servers.delete(existing);
    }

    checkAccessoryMustBeExternal(accessory: Accessory) {
        if (accessory[PluginAccessory.symbol] && accessory[PluginAccessory.symbol]!.cached_data &&
            accessory[PluginAccessory.symbol]!.cached_data.bridge_uuids_external &&
            accessory[PluginAccessory.symbol]!.cached_data.bridge_uuids_external.includes(this.uuid)) return true;

        if (!accessory[ExternalAccessoryGroups] || !accessory[ExternalAccessoryGroups]!.length) return false;

        if (this.bridge.bridgedAccessories.find(a => a[ExternalAccessoryGroups] &&
            a[ExternalAccessoryGroups]!.find(g => accessory[ExternalAccessoryGroups]!.includes(g)))) return true;

        for (const a of this.cached_accessories) {
            if (a.UUID === accessory.UUID) continue;
            if (!a[ExternalAccessoryGroups]) continue;
            if (a[PluginAccessory.symbol] && a[PluginAccessory.symbol]!.cached_data &&
                a[PluginAccessory.symbol]!.cached_data.bridge_uuids_external &&
                a[PluginAccessory.symbol]!.cached_data.bridge_uuids_external.includes(this.uuid)) continue;
            if (a[PluginAccessory.symbol] && a[PluginAccessory.symbol]!.cached_data &&
                a[PluginAccessory.symbol]!.cached_data.bridge_uuids &&
                a[PluginAccessory.symbol]!.cached_data.bridge_uuids_external &&
                a[PluginAccessory.symbol]!.cached_data.bridge_uuids.includes(this.uuid) &&
                !a[PluginAccessory.symbol]!.cached_data.bridge_uuids_external.includes(this.uuid)) return false;
            if (a[ExternalAccessoryGroups]!.find(g => accessory[ExternalAccessoryGroups]!.includes(g))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Adds an accessory.
     *
     * @param {Accessory} accessory
     */
    addAccessory(accessory: Accessory) {
        if (accessory[ExternalAccessory] || this.checkAccessoryMustBeExternal(accessory)) {
            this.addExternalAccessory(accessory);

            if (this.hasOwnProperty('hap_server') && this.hap_server.started) {
                const hap_server = this.getExternalAccessoryServer(accessory);
                hap_server.start();
            }
        } else {
            this.bridge.addBridgedAccessory(accessory);
        }

        this.removeCachedAccessory(accessory.UUID);
    }

    /**
     * Removes an accessory.
     *
     * @param {Accessory} accessory
     */
    removeAccessory(accessory: Accessory) {
        try {
            this.removeExternalAccessory(accessory);
        } catch (err) {}
        try {
            this.bridge.removeBridgedAccessory(accessory, false);
        } catch (err) {}

        this.removeCachedAccessory(accessory);
        if (this.hasOwnProperty('hap_server')) this.hap_server.unsubscribeAllEventsForAccessory(accessory);
    }

    /**
     * Adds and removes accessories.
     *
     * @param {Accessory[]} add
     * @param {Accessory[]} remove
     */
    patchAccessories(add: Accessory[], remove: Accessory[]) {
        try {
            for (const accessory of add) {
                if (accessory[ExternalAccessory] ||
                    (accessory[ExternalAccessoryGroups] && accessory[ExternalAccessoryGroups]!.length &&
                        this.bridge.bridgedAccessories.find(a => a[ExternalAccessoryGroups] &&
                            a[ExternalAccessoryGroups]!.find(g => accessory[ExternalAccessoryGroups]!.includes(g))))
                ) {
                    this.addExternalAccessory(accessory);

                    if (this.hasOwnProperty('hap_server') && this.hap_server.started) {
                        const hap_server = this.getExternalAccessoryServer(accessory);
                        hap_server.start();
                    }
                } else {
                    this.bridge.addBridgedAccessory(accessory, true);
                }

                this.removeCachedAccessory(accessory.UUID);
            }

            for (const accessory of remove) {
                try {
                    this.removeExternalAccessory(accessory);
                } catch (err) {}
                try {
                    this.bridge.removeBridgedAccessory(accessory, true);
                } catch (err) {}
                this.removeCachedAccessory(accessory.UUID);
                if (this.hasOwnProperty('hap_server')) this.hap_server.unsubscribeAllEventsForAccessory(accessory);
            }
        } finally {
            // @ts-expect-error
            this.bridge.enqueueConfigurationUpdate();
        }
    }

    addCachedAccessory(accessory: Accessory) {
        this.log.debug('Adding cached accessory %s (UUID %s)', accessory.displayName, accessory.UUID);

        if (accessory._isBridge) throw new Error('Cannot Bridge another Bridge!');

        // Check for UUID conflict
        for (const existing of this.bridge.bridgedAccessories) {
            if (existing.UUID === accessory.UUID) throw new Error('Cannot add a cached Accessory with the same' + // eslint-disable-line curly
                ' UUID as another bridged Accessory: ' + existing.UUID);
        }
        for (const existing of this.external_accessories) {
            if (existing.UUID === accessory.UUID) throw new Error('Cannot add a cached Accessory with the same' + // eslint-disable-line curly
                ' UUID as another external Accessory: ' + existing.UUID);
        }

        accessory.bridged = true;

        this.cached_accessories.push(accessory);
    }

    removeCachedAccessory(accessory: Accessory | string) {
        let index;
        while ((index = typeof accessory === 'string' ?
            this.cached_accessories.findIndex(a => a.UUID === accessory) :
            this.cached_accessories.indexOf(accessory)
        ) !== -1) this.cached_accessories.splice(index, 1);

        if (!this.cached_accessories.length) this.expireUnusedIDs();
    }

    removeAllCachedAccessories() {
        this.cached_accessories.splice(0, this.cached_accessories.length);

        this.expireUnusedIDs();
    }

    expireUnusedIDs() {
        if (!this.hasOwnProperty('identifier_cache') || !this.hasOwnProperty('hap_server')) return;

        this.identifier_cache.startTrackingUsage();

        this.hap_server.accessoryToHAP(this.bridge);
        for (const accessory of this.bridge.bridgedAccessories) this.hap_server.accessoryToHAP(accessory);
        for (const accessory of this.cached_accessories) this.hap_server.accessoryToHAP(accessory);

        this.identifier_cache.stopTrackingUsageAndExpireUnused();
        this.identifier_cache.save();
    }

    get setup_uri(): string {
        // Make sure this is set otherwise setupURI won't work
        this.bridge._accessoryInfo = this.accessory_info;

        return this.bridge.setupURI();
    }

    printSetupInfo() {
        console.log('Setup payload:', this.setup_uri);

        console.log('Scan this code with your HomeKit app on your iOS device:');
        qrcode.generate(this.setup_uri);

        console.log('Or enter this code with your HomeKit app on your iOS device:');
        console.log(chalk.black.bgWhite('                       '));
        console.log(chalk.black.bgWhite('    ┌────────────┐     '));
        console.log(chalk.black.bgWhite('    │ ' + this.pincode + ' │     '));
        console.log(chalk.black.bgWhite('    └────────────┘     '));
        console.log(chalk.black.bgWhite('                       '));
    }
}
