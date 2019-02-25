import EventEmitter from 'events';

import Vue from 'vue';

import Characteristic from './characteristic';

export default class Service extends EventEmitter {
    /**
     * Creates a Service.
     *
     * @param {Accessory} accessory
     * @param {string} uuid
     * @param {object} details The service exposed to Homebridge (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     */
    constructor(accessory, uuid, details, data) {
        super();

        this.accessory = accessory;
        this.uuid = uuid;
        this.characteristics = {};
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
        const removed_characteristic_ids = [];

        for (let characteristic_details of details.characteristics) {
            const characteristic = this.characteristics[characteristic_details.iid];

            // Characteristic doesn't already exist
            if (!characteristic) {
                added_characteristic_details.push(characteristic_details);
                continue;
            }

            characteristic._setDetails(characteristic_details);
        }

        for (let characteristic_id of Object.keys(this.characteristics)) {
            // Characteristic still exists
            if (details.characteristic.find(s => s.iid === characteristic_id)) continue;

            removed_characteristic_ids.push(characteristic_id);
        }

        const added_characteristics = added_characteristic_details.map(sd =>
            new Characteristic(this, sd.iid, sd));

        for (let characteristic of added_characteristics) {
            // Use Vue.set so Vue updates properly
            Vue.set(this.characteristics, characteristic.uuid, characteristic);
            this.emit('new-characteristic', characteristic);
        }

        if (added_characteristics.length) this.emit('new-characteristics', added_characteristics);

        const removed_characteristics = removed_characteristic_ids.map(id => this.characteristics[id]);

        for (let characteristic of removed_characteristics) {
            // Use Vue.delete so Vue updates properly
            Vue.delete(this.characteristics, characteristic.uuid);
            this.emit('removed-characteristic', characteristic);
        }

        if (removed_characteristics.length) this.emit('removed-characteristics', removed_characteristics);

        if (added_characteristics.length || removed_characteristics.length) this.emit('updated-characteristics', added_characteristics, removed_characteristics);
    }

    get data() {
        return this._data;
    }

    _setData(data, here) {
        this._data = Object.freeze(data);

        for (let key of Object.keys(data).filter(key => key.startsWith('Characteristic.'))) {
            const characteristic_id = key.substr(8);
            const characteristic = this.characteristics[characteristic_id];

            if (!characteristic) continue;

            characteristic._setData(data[key], here);
        }

        this.emit('data-updated', here);
        this.emit('updated', here);
    }

    get name() {
        return this.configured_name || this.default_name;
    }

    get configured_name() {
        return this.data.name;
    }

    get default_name() {
        return this.details.name;
    }

    get type() {
        return this.details.type;
    }

    findCharacteristic(callback) {
        for (let characteristic of Object.values(this.characteristics)) {
            if (callback.call(this, characteristic)) return characteristic;
        }
    }

    findCharacteristics(callback) {
        const characteristics = [];

        for (let characteristic of Object.values(this.characteristics)) {
            if (callback.call(this, characteristic)) characteristics.push(characteristic);
        }

        return services;
    }

    getCharacteristic(type) {
        return this.findCharacteristic(characteristic => characteristic.type === type);
    }
}
