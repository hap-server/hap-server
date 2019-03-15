
import os from 'os';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import {Bridge as HAPBridge, Accessory, Service, Characteristic} from './hap-async';
import AccessoryProxy from './accessoryproxy';

export default class Bridge {
    constructor(server, log, config) {
        this.server = server;
        this.log = log;

        if (!config || !config.uuid) {
            throw new Error('No UUID specified in bridge configuration');
        }

        this.uuid = config.uuid;
        this.name = config.name || os.hostname();
        this.username = config.username || 'CC:22:3D:E3:CE:30';
        this.port = config.port || 0;
        this.pincode = config.pincode || '031-45-154',
        this.unauthenticated_access = config.unauthenticated_access || false;

        this.accessory_uuids = config.accessory_uuids || [];
        this.cached_accessories = [];
        this.accessory_proxy_map = new WeakMap();

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

        bridge._assignIDs = this.assignIDs.bind(this);

        bridge._handleAccessories = callback => this.handleAccessories().then(v => callback(null, v), callback);

        bridge.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'Samuel Elliott')
            .setCharacteristic(Characteristic.Model, require('../../package').name)
            .setCharacteristic(Characteristic.SerialNumber, this.username)
            .setCharacteristic(Characteristic.FirmwareRevision, require('../../package').version)
            .setCharacteristic(Characteristic.HardwareRevision, os.hostname());

        return bridge;
    }

    publish() {
        if (this.cached_accessories.length) this.bridge.disableUnusedIDPurge();

        return this.bridge.publish({
            username: this.username,
            port: this.port,
            pincode: this.pincode,
            category: Accessory.Categories.BRIDGE,
            // setupID: this.setup_id && this.setup_id.length === 3 ? this.setup_id : undefined,
        }, this.unauthenticated_access);
    }

    unpublish() {
        this.bridge.unpublish();
    }

    /**
     * Assigns aid/iid to ourselves, any Accessories we are bridging, and all associated Services+Characteristics. Uses
     * the provided identifierCache to keep IDs stable.
     */
    assignIDs(identifier_cache) {
        // If we are responsible for our own identifierCache, start the expiration process
        // also check weather we want to have an expiration process
        if (this.bridge._identifierCache && this.bridge.shouldPurgeUnusedIDs) {
            this.bridge._identifierCache.startTrackingUsage();
        }

        if (this.bridge.bridged) {
            // This Accessory is bridged, so it must have an aid > 1. Use the provided identifierCache to
            // fetch or assign one based on our UUID.
            this.bridge.aid = identifier_cache.getAID(this.UUID);
        } else {
            // Since this Accessory is the server (as opposed to any Accessories that may be bridged behind us),
            // we must have aid = 1
            this.bridge.aid = 1;
        }

        for (const service of this.bridge.services) {
            if (this.bridge._isBridge) service._assignIDs(identifier_cache, this.UUID, 2000000000);
            else service._assignIDs(identifier_cache, this.UUID);
        }

        // Now assign IDs for any Accessories we are bridging
        for (const accessory of this.bridge.bridgedAccessories) {
            accessory._assignIDs(identifier_cache);
        }

        for (const accessory of this.cached_accessories) {
            accessory._assignIDs(identifier_cache);
        }

        // Expire any now-unused cache keys (for Accessories, Services, or Characteristics
        // that have been removed since the last call to assignIDs())
        if (this._identifierCache) {
            // Check weather we want to purge the unused ids
            if (this.shouldPurgeUnusedIDs) this._identifierCache.stopTrackingUsageAndExpireUnused();
            // Save in case we have new ones
            this._identifierCache.save();
        }
    }

    /**
     * Handle /accessories requests.
     * Called when an iOS client wishes to know all about our accessory via JSON payload.
     */
    async handleAccessories() {
        this.log.debug('Getting accessories for', this.name);

        // Make sure our aid/iid's are all assigned
        this.bridge._assignIDs(this.bridge._identifierCache);

        // Build out our JSON payload and call the callback
        return {
            // Array of Accessory HAP
            // _handleGetCharacteristics will return SERVICE_COMMUNICATION_FAILURE for cached characteristics
            accessories: this.bridge.toHAP().concat(this.cachedAccessoriesHAP()),
        };
    }

    cachedAccessoriesHAP(args) {
        return this.cached_accessories.map(accessory => accessory.toHAP(args)[0]);
    }

    getAccessoryProxy(accessory) {
        if (this.accessory_proxy_map.has(accessory)) return this.accessory_proxy_map.get(accessory);

        if (accessory instanceof AccessoryProxy) {
            this.accessory_proxy_map.set(accessory.accessory, accessory);
            return accessory;
        }

        const proxy = new AccessoryProxy(accessory /* , permissions */);
        this.accessory_proxy_map.set(accessory, proxy);

        return proxy;
    }

    addAccessory(accessory) {
        accessory = this.getAccessoryProxy(accessory);

        this.bridge.addBridgedAccessory(accessory);
        this.removeCachedAccessory(accessory);
    }

    removeAccessory(accessory) {
        accessory = this.getAccessoryProxy(accessory);

        this.bridge.removeBridgeAccessory(accessory);
    }

    addCachedAccessory(accessory) {
        accessory = this.getAccessoryProxy(accessory);

        this.log.debug('Adding cached accessory', accessory.displayName, 'to', this.name);

        if (accessory._isBridge) throw new Error('Cannot Bridge another Bridge!');

        // Check for UUID conflict
        const existing = this.bridge.bridgedAccessories.find(existing => existing.UUID === accessory.UUID) ||
            this.cached_accessories.find(existing => existing.UUID === accessory.UUID);
        if (existing) throw new Error('Cannot add a bridged Accessory with the same UUID as another bridged Accessory: ' + existing.UUID);

        accessory.bridged = true;

        this.cached_accessories.push(accessory);
    }

    removeCachedAccessory(accessory) {
        accessory = this.getAccessoryProxy(accessory);

        let index;
        while ((index = this.cached_accessories.indexOf(accessory)) !== -1) this.cached_accessories.splice(index, 1);

        // if (!this.cached_accessories.length) {
        //     this.bridge.purgeUnusedIDs();
        //     this.bridge.enableUnusedIDPurge();
        // }
    }

    removeAllCachedAccessories() {
        this.cached_accessories.splice(0, this.cached_accessories.length);
        this.bridge.purgeUnusedIDs();
        this.bridge.enableUnusedIDPurge();
    }

    printSetupInfo() {
        console.log('Setup payload:', this.bridge.setupURI());

        console.log('Scan this code with your HomeKit app on your iOS device:');
        qrcode.generate(this.bridge.setupURI());

        console.log('Or enter this code with your HomeKit app on your iOS device:');
        console.log(chalk.black.bgWhite('                       '));
        console.log(chalk.black.bgWhite('    ┌────────────┐     '));
        console.log(chalk.black.bgWhite('    │ ' + this.pincode + ' │     '));
        console.log(chalk.black.bgWhite('    └────────────┘     '));
        console.log(chalk.black.bgWhite('                       '));
    }
}
