import EventEmitter from 'events';

export default class Characteristic extends EventEmitter {
    /**
     * Creates a Characteristic.
     *
     * @param {Service} service
     * @param {string} uuid
     * @param {object} details The characteristic exposed to Homebridge (read only)
     */
    constructor(service, uuid, details) {
        super();

        this.service = service;
        this.uuid = uuid;
        this._setDetails(details || {});
    }

    get details() {
        return this._details;
    }

    _setDetails(details) {
        const old_value = this.details ? this.details.value : undefined;

        this._details = Object.freeze(details);

        if (this.value !== old_value) {
            this.emit('value-updated', this.value, old_value);
        }

        this.emit('details-updated');
        this.emit('updated');
    }

    get description() {
        return this.details.description;
    }

    get type() {
        return this.details.type;
    }

    get perms() {
        return this.details.perms;
    }

    get format() {
        return this.details.format;
    }

    get value() {
        return this.details.value;
    }

    async updateValue() {
        const details = await this.service.accessory.connection.getCharacteristic(this.service.accessory.uuid, this.service.uuid, this.uuid);

        this._setDetails(details);
    }

    setValue(value) {
        return this.service.accessory.connection.setCharacteristic(this.service.accessory.uuid, this.service.uuid, this.uuid, value);
    }

    static get types() {
        return type_uuids;
    }
}

export const types = {};
export const type_uuids = {};
export const type_names = {};

import {Characteristic as HAPCharacteristic} from 'hap-nodejs/lib/Characteristic';
import 'hap-nodejs/lib/gen/HomeKitTypes';

for (let key of Object.keys(HAPCharacteristic)) {
    if (HAPCharacteristic[key].prototype instanceof HAPCharacteristic) {
        types[key] = HAPCharacteristic[key];
        type_uuids[key] = HAPCharacteristic[key].UUID;
        type_names[HAPCharacteristic[key].UUID] = key;
    }
}

for (let key in type_uuids) {
    Characteristic[key] = type_uuids[key];
}
