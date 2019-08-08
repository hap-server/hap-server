import EventEmitter from 'events';

import {$set, $delete} from './client';
import Accessory from './accessory';
import Characteristic, {type_uuids as characteristic_type_uuids} from './characteristic';

export default class Service extends EventEmitter {
    /**
     * Creates a Service.
     *
     * @param {Accessory} accessory
     * @param {string} uuid
     * @param {object} details The HAP service data (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     * @param {Array} permissions An array of characteristic UUIDs the user has permission to update
     */
    constructor(accessory, uuid, details, data, permissions) {
        super();

        this.accessory = accessory;
        this.uuid = uuid;
        this.characteristics = {};
        this._setPermissions(permissions || []);
        this._setData(data || {});
        this._setDetails(details || {});
    }

    get details() {
        return this._details;
    }

    _setDetails(details) {
        this._updateCharacteristicsFrom(details);

        this._details = Object.freeze(details);

        this.emit('details-updated');
        this.emit('updated');
    }

    _updateCharacteristicsFrom(details) {
        const added_characteristic_details = [];
        const removed_characteristic_uuids = [];

        for (const characteristic_details of details.characteristics || []) {
            const characteristic = this.characteristics[characteristic_details.type];

            // Characteristic doesn't already exist
            if (!characteristic) {
                added_characteristic_details.push(characteristic_details);
                continue;
            }

            characteristic._setDetails(characteristic_details);
        }

        for (const characteristic_uuid of Object.keys(this.characteristics)) {
            // Characteristic still exists
            if (details.characteristic.find(c => c.type === characteristic_uuid)) continue;

            removed_characteristic_uuids.push(characteristic_uuid);
        }

        const added_characteristics = added_characteristic_details.map(cd =>
            new Characteristic(this, cd.type, cd, this._permissions.includes(cd.type)));

        for (const characteristic of added_characteristics) {
            // Use Vue.set so Vue updates properly
            $set(this.characteristics, characteristic.uuid, characteristic);
            this.emit('new-characteristic', characteristic);
        }

        if (added_characteristics.length) this.emit('new-characteristics', added_characteristics);

        const removed_characteristics = removed_characteristic_uuids.map(uuid => this.characteristics[uuid]);

        for (const characteristic of removed_characteristics) {
            // Use Vue.delete so Vue updates properly
            characteristic._handleRemove();
            $delete(this.characteristics, characteristic.uuid);
            this.emit('removed-characteristic', characteristic);
        }

        if (removed_characteristics.length) this.emit('removed-characteristics', removed_characteristics);

        if (added_characteristics.length || removed_characteristics.length) {
            this.emit('updated-characteristics', added_characteristics, removed_characteristics);
        }
    }

    get data() {
        return this._data;
    }

    _setData(data, here) {
        this._data = Object.freeze(data);

        this.emit('data-updated', here);
        this.emit('updated', here);
    }

    async updateData(data) {
        const accessory_data = Object.assign({}, this.accessory.data);
        accessory_data['Service.' + this.uuid] = data;
        await this.accessory.connection.setAccessoryData(this.accessory.uuid, accessory_data);
        this._setData(data, true);
    }

    get name() {
        return this.configured_name || this.default_name;
    }

    get configured_name() {
        return this.data.name;
    }

    get default_name() {
        return this.getCharacteristicValueByName('Name');
    }

    get type() {
        return this.details.type;
    }

    _setPermissions(permissions) {
        this._permissions = Object.freeze(permissions);

        for (const characteristic of Object.values(this.characteristics)) {
            characteristic._setPermissions(permissions.includes(characteristic.uuid));
        }

        this.emit('permissions-updated', permissions);
    }

    findCharacteristic(callback) {
        for (const characteristic of Object.values(this.characteristics)) {
            if (callback.call(this, characteristic)) return characteristic;
        }
    }

    findCharacteristics(callback) {
        const characteristics = [];

        for (const characteristic of Object.values(this.characteristics)) {
            if (callback.call(this, characteristic)) characteristics.push(characteristic);
        }

        return characteristics;
    }

    getCharacteristic(type) {
        return this.findCharacteristic(characteristic => characteristic.type === type);
    }

    getCharacteristicValue(type, use_target_value) {
        if (use_target_value === undefined) use_target_value = true;
        const characteristic = this.getCharacteristic(type);

        if (characteristic) return use_target_value ? characteristic.target_value : characteristic.value;
    }

    getCharacteristicByName(name) {
        return this.getCharacteristic(characteristic_type_uuids[name]);
    }

    getCharacteristicValueByName(name, use_target_value) {
        return this.getCharacteristicValue(characteristic_type_uuids[name], use_target_value);
    }

    setCharacteristic(type, value) {
        const characteristic = this.getCharacteristic(type);

        return characteristic.setValue(value);
    }

    setCharacteristicByName(name, value) {
        return this.setCharacteristic(characteristic_type_uuids[name], value);
    }

    setCharacteristics(values) {
        return this.accessory.connection.setCharacteristics(...Object.keys(values).map(uuid =>
            ([this.accessory.uuid, this.uuid, uuid, values[uuid]])));
    }

    setCharacteristicsByNames(values) {
        return this.accessory.connection.setCharacteristics(...Object.keys(values).map(name =>
            ([this.accessory.uuid, this.uuid, characteristic_type_uuids[name], values[name]])));
    }

    get is_system_service() {
        return system_types.includes(this.type);
    }

    get type_name() {
        return type_names[this.type];
    }

    static get types() {
        return type_uuids;
    }

    get collapse_to() {
        for (const collapsed_service_type of Object.keys(collapsed_services)) {
            const collapsed_service = collapsed_services[collapsed_service_type];

            if (collapsed_service.includes(this.type)) return collapsed_service_type;
        }
    }
}

export class BridgeService extends Service {
    /**
     * Creates a fake Service for bridges.
     *
     * @param {Accessory} accessory
     */
    constructor(accessory) {
        super(accessory, '--bridge');
    }

    static for(accessory) {
        const services = this.services || (this.services = new WeakMap());
        if (services.has(accessory)) return services.get(accessory);

        const service = new this(accessory);
        services.set(accessory, service);
        return service;
    }

    get type() {
        return '--bridge';
    }
}

export class UnsupportedService extends Service {
    /**
     * Creates a fake Service to display when an accessory has no supported services.
     *
     * @param {Accessory} accessory
     */
    constructor(accessory) {
        super(accessory, '');
    }

    static for(accessory) {
        const services = this.services || (this.services = new WeakMap());
        if (services.has(accessory)) return services.get(accessory);

        const service = new this(accessory);
        services.set(accessory, service);
        return service;
    }

    get type() {
        return '--unsupported';
    }
}

export class UnavailableService extends Service {
    /**
     * Creates a fake Service to display when an accessory/service doesn't exist anymore.
     *
     * @param {Accessory} accessory
     * @param {string} uuid
     */
    constructor(accessory, uuid) {
        super(accessory, uuid, null, accessory.data['Service.' + uuid]);
    }

    static for(connection, accessories, uuid, service_uuid) {
        const accessory_uuid = uuid.split('.', 1)[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);

        if (!accessories) accessories = {};
        const accessory = accessories[accessory_uuid] || new Accessory(connection, accessory_uuid);

        const service = new this(accessory, service_uuid);

        if (connection && !accessories[accessory_uuid]) {
            connection.getAccessories(accessory_uuid).then(([details]) => accessory._setDetails(details || {}, true));
            connection.getAccessoriesData(accessory_uuid).then(([data]) => accessory._setData(data || {}));
            connection.getAccessoriesPermissions(accessory_uuid)
                .then(([permissions]) => accessory._setPermissions(permissions || {}));
        }

        // if (!accessories[accessory_uuid]) accessories[accessory_uuid] = accessory;
        if (!accessory.services[service_uuid]) accessory.services[service_uuid] = service;

        return service;
    }

    get is_unavailable() {
        return true;
    }
}

export const types = {};
export const type_uuids = {};
export const type_names = {};

import {Service as HAPService} from 'hap-nodejs/lib/Service';
import 'hap-nodejs/lib/gen/HomeKitTypes';

for (const key of Object.keys(HAPService)) {
    if (HAPService[key].prototype instanceof HAPService) {
        types[key] = HAPService[key];
        type_uuids[key] = HAPService[key].UUID;
        type_names[HAPService[key].UUID] = key;
    }
}

for (const key of Object.keys(type_uuids)) {
    Service[key] = type_uuids[key];
}

export const system_types = [
    Service.AccessoryInformation,
    Service.BatteryService,
    Service.InputSource, // Input Source services are used by the Television service

    // Bridge Setup
    // https://github.com/nfarina/homebridge/blob/0d77bb93d33a7b6e158efe4b4d546636d976d5c7/lib/bridgeSetupManager.js
    '49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE',
];

export const collapsed_services = {
    [Service.StatelessProgrammableSwitch]: [Service.StatelessProgrammableSwitch],
    [Service.Television]: [Service.Television, Service.TelevisionSpeaker, Service.InputSource],
};

global.Service = Service;
