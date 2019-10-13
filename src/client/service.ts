import EventEmitter from 'events';

import {$set, $delete} from './client';
import Connection from './connection';
import Accessory from './accessory';
import Characteristic, {type_uuids as characteristic_type_uuids} from './characteristic';

export default class Service extends EventEmitter {
    readonly accessory: Accessory;
    readonly uuid: string;
    readonly characteristics: {[key: string]: Characteristic};
    readonly linked_services: Service[];

    private _details;
    private _data;
    private _permissions;

    /**
     * Creates a Service.
     *
     * @param {Accessory} accessory
     * @param {string} uuid
     * @param {object} details The HAP service data (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     * @param {Array} permissions An array of characteristic UUIDs the user has permission to update
     */
    constructor(accessory: Accessory, uuid: string, details?, data?, permissions?) {
        super();

        this.accessory = accessory;
        this.uuid = uuid;
        this.characteristics = {};
        this.linked_services = [];
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

    _handleAddLinkedService(service: Service) {
        if (this.linked_services.includes(service)) return;

        this.linked_services.push(service);
        this.emit('add-linked-service', service);
    }

    /**
     * @param service The service that was unlinked
     * @param removed true if the service was removed from the accessory
     */
    _handleRemoveLinkedService(service: Service, removed: boolean) {
        if (!this.linked_services.includes(service)) return;

        let index;
        while ((index = this.linked_services.indexOf(service)) > -1) this.linked_services.splice(index, 1);

        this.emit('remove-linked-service', service, removed);
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

    _setData(data, here?) {
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

    get configured_name(): string {
        return this.data.name;
    }

    get default_name(): string {
        return this.getCharacteristicValueByName('Name');
    }

    get type(): string {
        return this.details.type;
    }

    get primary() {
        return this.accessory.primary_service === this;
    }

    get hidden() {
        return !!this.details.hidden;
    }

    _setPermissions(permissions) {
        this._permissions = Object.freeze(permissions);

        for (const characteristic of Object.values(this.characteristics)) {
            characteristic._setPermissions(permissions.includes(characteristic.uuid));
        }

        this.emit('permissions-updated', permissions);
    }

    findCharacteristic(callback: (characteristic: Characteristic) => boolean) {
        for (const characteristic of Object.values(this.characteristics)) {
            if (callback.call(this, characteristic)) return characteristic;
        }
    }

    findCharacteristics(callback: (characteristic: Characteristic) => boolean) {
        const characteristics: Characteristic[] = [];

        for (const characteristic of Object.values(this.characteristics)) {
            if (callback.call(this, characteristic)) characteristics.push(characteristic);
        }

        return characteristics;
    }

    getCharacteristic(type: string) {
        return this.findCharacteristic(characteristic => characteristic.type === type);
    }

    /**
     * @param {string} type The type UUID of the characteristic
     * @param {boolean} [use_target_value] If true (default) and the client is waiting for the server to set the characteristic, use that value instead
     * @return {any}
     */
    getCharacteristicValue(type: string, use_target_value = true) {
        // if (use_target_value === undefined) use_target_value = true;
        const characteristic = this.getCharacteristic(type);

        if (characteristic) return use_target_value ? characteristic.target_value : characteristic.value;
    }

    getCharacteristicByName(name: string) {
        return this.getCharacteristic(characteristic_type_uuids[name]);
    }

    getCharacteristicValueByName(name: string, use_target_value = true) {
        return this.getCharacteristicValue(characteristic_type_uuids[name], use_target_value);
    }

    setCharacteristic(type: string, value) {
        const characteristic = this.getCharacteristic(type);

        return characteristic.setValue(value);
    }

    setCharacteristicByName(name: string, value) {
        return this.setCharacteristic(characteristic_type_uuids[name], value);
    }

    setCharacteristics(values) {
        return this.accessory.connection.setCharacteristics(...Object.keys(values)
            .map(uuid => [this.accessory.uuid, this.uuid, uuid, values[uuid]]) as unknown as
                {0: string; 1: string; 2: string; 3: any}[]);
    }

    setCharacteristicsByNames(values) {
        return this.accessory.connection.setCharacteristics(...Object.keys(values)
            .map(name => [this.accessory.uuid, this.uuid, characteristic_type_uuids[name], values[name]]) as unknown as
                {0: string; 1: string; 2: string; 3: any}[]);
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

            if (typeof collapsed_service === 'function') {
                if (collapsed_service.call(null, this)) return collapsed_service_type;
            } else if (collapsed_service.includes(this.type)) {
                return collapsed_service_type;
            }
        }
    }
}

export class BridgeService extends Service {
    private static services = new WeakMap<Accessory, BridgeService>();

    /**
     * Creates a fake Service for bridges.
     *
     * @param {Accessory} accessory
     */
    constructor(accessory: Accessory) {
        super(accessory, '--bridge');
    }

    static for(accessory: Accessory) {
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
    private static services = new WeakMap<Accessory, UnsupportedService>();

    /**
     * Creates a fake Service to display when an accessory has no supported services.
     *
     * @param {Accessory} accessory
     */
    constructor(accessory: Accessory) {
        super(accessory, '');
    }

    static for(accessory: Accessory) {
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
    constructor(accessory: Accessory, uuid: string) {
        super(accessory, uuid, null, accessory.data['Service.' + uuid]);
    }

    static for(connection: Connection, accessories: {[key: string]: Accessory}, uuid: string, service_uuid: string) {
        const accessory_uuid = uuid.split('.', 1)[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);

        if (!accessories) accessories = {};
        const accessory = accessories[accessory_uuid] || new Accessory(connection, accessory_uuid, null, null, null);

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

export const types: {[key: string]: string} = {};
export const type_uuids: {[key: string]: string} = {};
export const type_names: {[key: string]: string} = {};

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
    type_uuids.AccessoryInformation,
    type_uuids.BatteryService,
    type_uuids.InputSource, // Input Source services are used by the Television service

    // Bridge Setup
    // https://github.com/nfarina/homebridge/blob/0d77bb93d33a7b6e158efe4b4d546636d976d5c7/lib/bridgeSetupManager.js
    '49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE',
];

export const collapsed_services: {
    [collapsed_service_type: string]: string[] | {(service: Service): boolean};
} = {
    [type_uuids.StatelessProgrammableSwitch]: [type_uuids.StatelessProgrammableSwitch],
};

// @ts-ignore
global.Service = Service;
