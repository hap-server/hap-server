
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import {Bridge as HAPBridge, Accessory, Service, Characteristic} from './hap-async';
import HAPServer from './hap-server';

import {AccessoryInfo} from 'hap-nodejs/lib/model/AccessoryInfo';
import {IdentifierCache} from 'hap-nodejs/lib/model/IdentifierCache';
import {clone} from 'hap-nodejs/lib/util/clone';

export default class Bridge {
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
        const existing = bridge.bridgedAccessories.findIndex(a => a.UUID === accessory.UUID);
        if (existing <= -1) throw new Error('Cannot find the bridged Accessory to remove.');

        bridge.bridgedAccessories.splice(index, 1);

        this._removeBridgedAccessoryEventListeners(bridge, accessory);

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
        }

        // Update our advertisement so HomeKit on iOS can pickup new accessory
        if (!dont_update_advertisement) this.hap_server.updateAdvertisement();
    }

    publish() {
        this._updateConfiguration(this.bridge, true);

        this.hap_server.start();
    }

    unpublish() {
        if (this.hasOwnProperty('hap_server')) this.hap_server.stop();
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

        accessory_info.setupID = this._setupID;

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
        }, this.log.withPrefix('Server'), this.accessory_info, this.identifier_cache);

        return Object.defineProperty(this, 'hap_server', {value: hap_server}).hap_server;
    }

    /**
     * Adds an accessory.
     *
     * @param {Accessory} accessory
     */
    addAccessory(accessory) {
        this.bridge.addBridgedAccessory(accessory);
        this.removeCachedAccessory(accessory.UUID);
    }

    /**
     * Removes an accessory.
     *
     * @param {Accessory} accessory
     */
    removeAccessory(accessory) {
        this.bridge.removeBridgeAccessory(accessory);
        this.removeCachedAccessory(accessory);
    }

    addCachedAccessory(accessory) {
        this.log.debug('Adding cached accessory', accessory.displayName, 'to', this.name);

        if (accessory._isBridge) throw new Error('Cannot Bridge another Bridge!');

        // Check for UUID conflict
        const existing = this.bridge.bridgedAccessories.find(existing => existing.UUID === accessory.UUID) ||
            this.cached_accessories.find(existing => existing.UUID === accessory.UUID);
        if (existing) throw new Error('Cannot add a bridged Accessory with the same UUID as another bridged' + // eslint-disable-line curly
            ' Accessory: ' + existing.UUID);

        accessory.bridged = true;

        this.cached_accessories.push(accessory);
    }

    removeCachedAccessory(accessory) {
        let index;
        while ((index = typeof accessory === 'string' ?
            this.cached_accessories.findIndex(a => a.UUID === accessory.UUID) :
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
