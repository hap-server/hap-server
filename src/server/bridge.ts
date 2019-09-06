
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import {Accessory, Service, Characteristic} from 'hap-nodejs';
import {Bridge as HAPBridge} from 'hap-nodejs/lib/Bridge';
import HAPServer from './hap-server';

import {AccessoryInfo} from 'hap-nodejs/lib/model/AccessoryInfo';
import {IdentifierCache} from 'hap-nodejs/lib/model/IdentifierCache';
import {clone} from 'hap-nodejs/lib/util/clone';

import Server from './server';
import Logger from '../common/logger';

export default class Bridge {
    readonly server: Server;
    readonly log: Logger;

    readonly config;
    readonly uuid: string;
    readonly name: string;
    readonly username: string;
    readonly port: number;
    readonly pincode: string;
    readonly unauthenticated_access: boolean;

    readonly accessory_uuids: string[];
    readonly external_accessories: typeof Accessory[];
    readonly external_accessory_accessory_infos: Map<typeof Accessory, AccessoryInfo>;
    readonly external_accessory_identifier_caches: Map<typeof Accessory, IdentifierCache>;
    readonly external_accessory_servers: Map<typeof Accessory, HAPServer>;
    readonly cached_accessories: typeof Accessory[];

    private bridge: HAPBridge;
    _handleCharacteristicUpdate: any;

    constructor(server, log, config) {
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

        this.bridge.on('listening', port => {
            this.log.info(`${this.name} is running on port ${port}`);
            Object.freeze(this);
        });

        this._handleCharacteristicUpdate = this.server._handleCharacteristicUpdate.bind(this.server, this.bridge);
        this.bridge.on('service-characteristic-change', this._handleCharacteristicUpdate);
    }

    _createBridge(config) {
        const bridge = new HAPBridge(this.name, this.uuid);

        bridge.on('hap-server-update-pairings', () => this.server.handlePairingsUpdate(this));

        bridge.addBridgedAccessory = this._addBridgedAccessory.bind(this, bridge);
        bridge.removeBridgeAccessory = this._removeBridgedAccessory.bind(this, bridge);
        bridge._updateConfiguration = this._updateConfiguration.bind(this, bridge, false);

        bridge.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'Samuel Elliott')
            .setCharacteristic(Characteristic.Model, require('../../package').name)
            .setCharacteristic(Characteristic.SerialNumber, this.username)
            .setCharacteristic(Characteristic.FirmwareRevision, require('../../package').version)
            .setCharacteristic(Characteristic.HardwareRevision, os.hostname());

        return bridge;
    }

    _addBridgedAccessory(bridge, accessory, defer_update) {
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

        const _eventhandlers = bridge.__hap_server_eventhandlers || (bridge.__hap_server_eventhandlers = new WeakMap());
        let eventhandlers = _eventhandlers.get(accessory);
        if (!eventhandlers) _eventhandlers.set(accessory, eventhandlers = {});

        if (!eventhandlers.characteristic_change) eventhandlers.characteristic_change = change => { // eslint-disable-line curly
            bridge._handleCharacteristicChange(clone(change, {accessory}));
        };
        if (!eventhandlers.configuration_change) eventhandlers.configuration_change = change => { // eslint-disable-line curly
            bridge._updateConfiguration();
        };

        accessory.on('service-characteristic-change', eventhandlers.characteristic_change);
        accessory.on('service-configurationChange', eventhandlers.configuration_change);

        accessory.bridged = true;
        bridge.bridgedAccessories.push(accessory);

        if (!defer_update) bridge._updateConfiguration();

        return accessory;
    }

    _removeBridgedAccessory(bridge, accessory, defer_update) {
        const index = bridge.bridgedAccessories.findIndex(a => a.UUID === accessory.UUID);
        if (index <= -1) throw new Error('Cannot find the bridged Accessory to remove.');

        const existing = bridge.bridgedAccessories[index];
        bridge.bridgedAccessories.splice(index, 1);

        this._removeBridgedAccessoryEventListeners(bridge, existing);

        if (!defer_update) bridge._updateConfiguration();
    }

    _removeBridgedAccessoryEventListeners(bridge, accessory) {
        if (!bridge.__hap_server_eventhandlers) return;
        const eventhandlers = bridge.__hap_server_eventhandlers.get(accessory);
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

    _updateConfiguration(bridge, dont_update_advertisement) {
        this.log.debug('Maybe update configuration for bridge', bridge.UUID);

        if (!dont_update_advertisement && (!this.hasOwnProperty('hap_server') ||
            !this.hasOwnProperty('accessory_info') || !this.hap_server.is_advertising)) return;

        this.log.debug('Updating configuration for bridge', bridge.UUID);

        // Get our accessory information in HAP format and determine if our configuration (that is, our
        // Accessories/Services/Characteristics) has changed since the last time we were published. Make
        // sure to omit actual values since these are not part of the "configuration".
        const config = this.hap_server.toHAP({omitValues: true});

        // Now convert it into a hash code and check it against the last one we made, if we have one
        const shasum = crypto.createHash('sha1');
        shasum.update(JSON.stringify(config));
        const config_hash = shasum.digest('hex');

        if (this.accessory_info.configHash !== config_hash) {
            this.log.debug('Saving new config hash (old: %s, new: %s, version: %d)',
                this.accessory_info.configHash, config_hash, this.accessory_info.configVersion + 1);

            // Our configuration has changed!
            // We'll need to bump our config version number
            this.accessory_info.configVersion++;
            this.accessory_info.configHash = config_hash;
            this.accessory_info.save();
        } else {
            this.log.debug('Config hash hasn\'t changed (old: %s, new: %s, version: %d)',
                this.accessory_info.configHash, config_hash, this.accessory_info.configVersion);
        }

        // Update our advertisement so HomeKit on iOS can pickup new accessory
        if (!dont_update_advertisement) this.hap_server.updateAdvertisement();
    }

    publish() {
        this._updateConfiguration(this.bridge, true);

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

    get accessory_info() {
        // Attempt to load existing AccessoryInfo from disk
        let accessory_info = AccessoryInfo.load(this.username);

        // If we don't have one, create a new one
        if (!accessory_info) {
            this.log.debug('Creating new AccessoryInfo');
            accessory_info = AccessoryInfo.create(this.username);
        }

        if (accessory_info.setupID === undefined || accessory_info.setupID === '') {
            this.bridge._setupID = this.bridge._generateSetupID();
        } else {
            this.bridge._setupID = accessory_info.setupID;
        }

        accessory_info.setupID = this.bridge._setupID;

        // Make sure we have up-to-date values in AccessoryInfo, then save it in case they changed (or if we just created it)
        accessory_info.displayName = this.name;
        accessory_info.category = Accessory.Categories.BRIDGE;
        accessory_info.pincode = this.pincode;
        accessory_info.save();

        return Object.defineProperty(this, 'accessory_info', {value: accessory_info}).accessory_info;
    }

    get identifier_cache() {
        // Create our IdentifierCache so we can provide clients with stable aid/iid's
        let identifier_cache = IdentifierCache.load(this.username);

        // If we don't have one, create a new one
        if (!identifier_cache) {
            this.log.debug('Creating new IdentifierCache');
            identifier_cache = new IdentifierCache(this.username);
        }

        return Object.defineProperty(this, 'identifier_cache', {value: identifier_cache}).identifier_cache;
    }

    get hap_server() {
        // Create our HAP server which handles all communication between iOS devices and us
        const hap_server = new HAPServer(this.bridge, {
            port: this.port,
            unauthenticated_access: this.unauthenticated_access,
            hostname: this.server.hostname,
        }, this.log.withPrefix('Server'), this.accessory_info, this.identifier_cache);

        return Object.defineProperty(this, 'hap_server', {value: hap_server}).hap_server;
    }

    addExternalAccessory(accessory) {
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

    static generateExternalAccessoryUsername(bridge_username, accessory_uuid) {
        const sha1sum = crypto.createHash('sha1');
        sha1sum.update(bridge_username + '-' + accessory_uuid);
        const s = sha1sum.digest('hex');
        let i = 0;
        return `${bridge_username.substr(0, 8)}:xx:xx:xx`.replace(/[x]/g, x => s[i++]);
    }

    static getExternalAccessoryCategory(accessory) {
        if (accessory.category !== Accessory.Categories.OTHER) return accessory.category;

        if (accessory._isBridge) return Accessory.Categories.BRIDGE;

        if (accessory.services.find(s => s.UUID === Service.Fan.UUID)) return Accessory.Categories.FAN;
        if (accessory.services.find(s =>
            s.UUID === Service.GarageDoorOpener.UUID)) return Accessory.Categories.GARAGE_DOOR_OPENER;
        if (accessory.services.find(s => s.UUID === Service.Lightbulb.UUID)) return Accessory.Categories.LIGHTBULB;
        if (accessory.services.find(s => s.UUID === Service.LockMechanism.UUID)) return Accessory.Categories.DOOR_LOCK;
        if (accessory.services.find(s => s.UUID === Service.Outlet.UUID)) return Accessory.Categories.OUTLET;
        if (accessory.services.find(s => s.UUID === Service.Switch.UUID)) return Accessory.Categories.SWITCH;
        if (accessory.services.find(s => s.UUID === Service.Thermostat.UUID)) return Accessory.Categories.THERMOSTAT;
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
            s.UUID === Service.AirQualitySensor.UUID)) return Accessory.Categories.SENSOR;
        if (accessory.services.find(s =>
            s.UUID === Service.SecuritySystem.UUID)) return (Accessory.Categories as any).SECURITY_SYSTEM;
        if (accessory.services.find(s => s.UUID === Service.Door.UUID)) return Accessory.Categories.DOOR;
        if (accessory.services.find(s => s.UUID === Service.Window.UUID)) return Accessory.Categories.WINDOW;
        if (accessory.services.find(s =>
            s.UUID === Service.WindowCovering.UUID)) return Accessory.Categories.WINDOW_COVERING;
        if (accessory.services.find(s =>
            s.UUID === Service.StatelessProgrammableSwitch.UUID)) return Accessory.Categories.PROGRAMMABLE_SWITCH;
        if (accessory.cameraSource && accessory.services.find(s =>
            s.UUID === Service.Doorbell.UUID)) return (Accessory.Categories as any).VIDEO_DOORBELL;
        if (accessory.cameraSource) return (Accessory.Categories as any).IP_CAMERA;
        if (accessory.services.find(s => s.UUID === Service.AirPurifier.UUID)) return (Accessory.Categories as any).AIR_PURIFIER;
        if (accessory.services.find(s => s.UUID === Service.Television.UUID)) return (Accessory.Categories as any).TELEVISION;
        if (accessory.services.find(s => s.UUID === Service.Speaker.UUID)) return (Accessory.Categories as any).SPEAKER;
        if (accessory.services.find(s => s.UUID === Service.Valve.UUID &&
            s.getCharacteristic(Characteristic.ValveType).value === Characteristic.ValveType.IRRIGATION
        )) return (Accessory.Categories as any).SPRINKLER;
        if (accessory.services.find(s => s.UUID === Service.Faucet.UUID || (s.UUID === Service.Valve.UUID &&
            s.getCharacteristic(Characteristic.ValveType).value === Characteristic.ValveType.WATER_FAUCET)
        )) return (Accessory.Categories as any).FAUCET;
        if (accessory.services.find(s => s.UUID === Service.Valve.UUID &&
            s.getCharacteristic(Characteristic.ValveType).value === Characteristic.ValveType.SHOWER_HEAD
        )) return (Accessory.Categories as any).SHOWER_HEAD;

        return Accessory.Categories.OTHER;
    }

    getExternalAccessoryAccessoryInfo(accessory) {
        if (!this.external_accessories.includes(accessory)) {
            throw new Error('Unknown external accessory');
        }

        if (this.external_accessory_accessory_infos.has(accessory)) {
            return this.external_accessory_accessory_infos.get(accessory);
        }

        const username = (this.constructor as typeof Bridge).generateExternalAccessoryUsername(this.username, accessory.UUID);

        // Attempt to load existing AccessoryInfo from disk
        let accessory_info = AccessoryInfo.load(username);

        // If we don't have one, create a new one
        if (!accessory_info) {
            this.log.debug('Creating new AccessoryInfo for external accessory %s (UUID %s)',
                accessory.displayName, accessory.UUID);
            accessory_info = AccessoryInfo.create(username);
        }

        if (accessory_info.setupID === undefined || accessory_info.setupID === '') {
            accessory._setupID = accessory._generateSetupID();
        } else {
            accessory._setupID = accessory_info.setupID;
        }

        accessory_info.setupID = accessory._setupID;

        // Make sure we have up-to-date values in AccessoryInfo, then save it in case they changed (or if we just created it)
        accessory_info.displayName = this.name + ' ' + accessory.displayName;
        accessory_info.category = (this.constructor as typeof Bridge).getExternalAccessoryCategory(accessory);
        accessory_info.pincode = this.pincode;
        accessory_info.save();

        this.external_accessory_accessory_infos.set(accessory, accessory_info);
        return accessory_info;
    }

    getExternalAccessoryIdentifierCache(accessory) {
        if (!this.external_accessories.includes(accessory)) {
            throw new Error('Unknown external accessory');
        }

        if (this.external_accessory_identifier_caches.has(accessory)) {
            return this.external_accessory_identifier_caches.get(accessory);
        }

        const username = (this.constructor as typeof Bridge).generateExternalAccessoryUsername(this.username, accessory.UUID);

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

    getExternalAccessoryServer(accessory) {
        if (!this.external_accessories.includes(accessory)) {
            throw new Error('Unknown external accessory');
        }

        if (this.external_accessory_servers.has(accessory)) {
            return this.external_accessory_servers.get(accessory);
        }

        // Create our HAP server which handles all communication between iOS devices and us
        const hap_server = new HAPServer(
            accessory, {
                port: this.port,
                unauthenticated_access: this.unauthenticated_access,
            },
            this.log.withPrefix('External ' + accessory.displayName, 'Server'),
            this.getExternalAccessoryAccessoryInfo(accessory),
            this.getExternalAccessoryIdentifierCache(accessory),
            accessory.cameraSource
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

    expireExternalAccessoryUnusedIDs(accessory) {
        if (!this.external_accessory_identifier_caches.has(accessory) ||
            !this.external_accessory_servers.has(accessory)) return;

        const identifier_cache = this.external_accessory_identifier_caches.get(accessory);
        const hap_server = this.external_accessory_servers.get(accessory);

        identifier_cache.startTrackingUsage();

        hap_server.toHAP(accessory);
        for (const a of accessory.bridgedAccessories) hap_server.toHAP(a);

        identifier_cache.stopTrackingUsageAndExpireUnused();
        identifier_cache.save();
    }

    removeExternalAccessory(accessory) {
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

    checkAccessoryMustBeExternal(accessory) {
        if (accessory.plugin_accessory && accessory.plugin_accessory.cached_data &&
            accessory.plugin_accessory.cached_data.bridge_uuids_external &&
            accessory.plugin_accessory.cached_data.bridge_uuids_external.includes(this.uuid)) return true;

        if (!accessory.external_groups || !accessory.external_groups.length) return false;

        if (this.bridge.bridgedAccessories.find(a => a.external_groups &&
            a.external_groups.find(g => accessory.external_groups.includes(g)))) return true;

        for (const a of this.cached_accessories) {
            if (a.UUID === accessory.UUID) continue;
            if (!(a as any).external_groups) continue;
            if ((a as any).plugin_accessory && (a as any).plugin_accessory.cached_data &&
                (a as any).plugin_accessory.cached_data.bridge_uuids_external &&
                (a as any).plugin_accessory.cached_data.bridge_uuids_external.includes(this.uuid)) continue;
            if ((a as any).plugin_accessory && (a as any).plugin_accessory.cached_data &&
                (a as any).plugin_accessory.cached_data.bridge_uuids &&
                (a as any).plugin_accessory.cached_data.bridge_uuids_external &&
                (a as any).plugin_accessory.cached_data.bridge_uuids.includes(this.uuid) &&
                !(a as any).plugin_accessory.cached_data.bridge_uuids_external.includes(this.uuid)) return false;
            if ((a as any).external_groups.find(g => accessory.external_groups.includes(g))) return true;
        }

        return false;
    }

    /**
     * Adds an accessory.
     *
     * @param {Accessory} accessory
     */
    addAccessory(accessory) {
        if (accessory.external || this.checkAccessoryMustBeExternal(accessory)) {
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
    removeAccessory(accessory) {
        try {
            this.removeExternalAccessory(accessory);
        } catch (err) {}
        try {
            this.bridge.removeBridgeAccessory(accessory);
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
    patchAccessories(add, remove) {
        try {
            for (const accessory of add) {
                if (accessory.external || (accessory.external_groups && accessory.external_groups.length &&
                    this.bridge.bridgedAccessories.find(a => a.external_groups &&
                        a.external_groups.find(g => accessory.external_groups.includes(g)))
                )) {
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
                    this.bridge.removeBridgeAccessory(accessory, true);
                } catch (err) {}
                this.removeCachedAccessory(accessory.UUID);
                if (this.hasOwnProperty('hap_server')) this.hap_server.unsubscribeAllEventsForAccessory(accessory);
            }
        } finally {
            this.bridge._updateConfiguration();
        }
    }

    addCachedAccessory(accessory) {
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

    removeCachedAccessory(accessory) {
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

        this.hap_server.toHAP(this.bridge);
        for (const accessory of this.bridge.bridgedAccessories) this.hap_server.toHAP(accessory);
        for (const accessory of this.cached_accessories) this.hap_server.toHAP(accessory);

        this.identifier_cache.stopTrackingUsageAndExpireUnused();
        this.identifier_cache.save();
    }

    get setup_uri() {
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
