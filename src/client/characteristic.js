import EventEmitter from 'events';
import Client from './client';

export default class Characteristic extends EventEmitter {
    /**
     * Creates a Characteristic.
     *
     * @param {Service} service
     * @param {string} uuid
     * @param {object} details The HAP characteristic data (read only)
     * @param {boolean} permissions Whether the user can set this characteristic
     */
    constructor(service, uuid, details, permissions) {
        super();

        this.service = service;
        this.uuid = uuid;
        this._setDetails(details || {});
        this._setPermissions(permissions);
        this._subscribed = false;
        this.subscription_dependencies = new Set();
    }

    get details() {
        return this._details;
    }

    _setDetails(details) {
        const old_value = this.details ? this.details.value : undefined;

        this._details = Object.freeze(details);

        // Don't check if the value has actually changed so event only characteristics update properly
        this.emit('value-updated', this.value, old_value);

        this.emit('details-updated');
        this.emit('updated');
    }

    get description() {
        return this.details.description;
    }

    get type() {
        return this.details.type;
    }

    get type_name() {
        return type_names[this.type];
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

    get valid_values() {
        return this.details['valid-values'];
    }

    get valid_values_range() {
        return this.details['valid-values-range'];
    }

    get unit() {
        return this.details.unit;
    }

    get max_value() {
        return this.details.maxValue;
    }

    get min_value() {
        return this.details.minValue;
    }

    get min_step() {
        return this.details.minStep;
    }

    async updateValue() {
        const details = await this.service.accessory.connection.getCharacteristic(
            this.service.accessory.uuid, this.service.uuid, this.uuid);

        this._setDetails(details);
    }

    async setValue(value) {
        if (this.service.characteristics[this.uuid] !== this) {
            throw new Error('This characteristic no longer exists');
        }

        return this.service.accessory.connection.setCharacteristic(
            this.service.accessory.uuid, this.service.uuid, this.uuid, value);
    }

    get subscribed() {
        // Force Vue to watch this property, as Vue doesn't support Sets
        this._subscribed;

        return this.service.accessory.connection.subscribed_characteristics.has(this);
    }

    get subscribing() {
        return this.service.accessory.connection.subscribe_queue &&
            !!this.service.accessory.connection.subscribe_queue.find(q => q[0] === this);
    }

    get unsubscribing() {
        return this.service.accessory.connection.unsubscribe_queue &&
            !!this.service.accessory.connection.unsubscribe_queue.find(q => q[0] === this);
    }

    subscribe(dep) {
        if (this.service.characteristics[this.uuid] !== this) {
            throw new Error('This characteristic no longer exists');
        }

        if (dep) {
            this.subscription_dependencies.add(dep);

            let subscribed = subscribed_characteristics.get(dep);
            if (!subscribed) subscribed_characteristics.set(dep, subscribed = new Set());
            subscribed.add(this);
        }

        if (this.subscribed) return true;

        return Client.queueSubscribeCharacteristic(this);
    }

    unsubscribe(dep) {
        if (dep) {
            this.subscription_dependencies.delete(dep);

            const subscribed = subscribed_characteristics.get(dep);
            if (subscribed) subscribed.delete(this);
            if (subscribed && !subscribed.size) subscribed_characteristics.delete(dep);

            // If there are more dependencies don't unsubscribe yet
            if (this.subscription_dependencies.size) return;
        }

        if (!this.subscribed) return true;

        return Client.queueUnsubscribeCharacteristic(this);
    }

    static async unsubscribeAll(dep) {
        const subscribed = subscribed_characteristics.get(dep);
        if (!subscribed) return;

        const unsubscribe = [];

        for (const characteristic of subscribed) {
            unsubscribe.push(characteristic.unsubscribe(dep));
        }

        return Promise.all(unsubscribe);
    }

    _handleRemove() {
        this.service.accessory.connection.subscribed_characteristics.delete(this);

        for (const [dep, subscribed] of subscribed_characteristics.entries()) {
            subscribed.delete(this);
            if (!subscribed.size) subscribed_characteristics.delete(dep);
        }
    }

    _setPermissions(permissions) {
        this._permissions = !!permissions;

        this.emit('permissions-updated', !!permissions);
    }

    get can_get() {
        return this.perms.includes('pr'); // PAIRED_READ
    }

    get can_set() {
        return this._permissions && this.perms.includes('pw'); // PAIRED_WRITE
    }

    get can_subscribe() {
        return this.perms.includes('ev'); // EVENTS
    }

    static get types() {
        return type_uuids;
    }
}

const subscribed_characteristics = new Map();

export const types = {};
export const type_uuids = {};
export const type_names = {};

import {Characteristic as HAPCharacteristic} from 'hap-nodejs/lib/Characteristic';
import 'hap-nodejs/lib/gen/HomeKitTypes';

Characteristic.Formats = HAPCharacteristic.Formats;
Characteristic.Units = HAPCharacteristic.Units;
Characteristic.Perms = HAPCharacteristic.Perms;

for (const key of Object.keys(HAPCharacteristic)) {
    if (HAPCharacteristic[key].prototype instanceof HAPCharacteristic) {
        types[key] = HAPCharacteristic[key];
        type_uuids[key] = HAPCharacteristic[key].UUID;
        type_names[HAPCharacteristic[key].UUID] = key;
    }
}

for (const key of Object.keys(type_uuids)) {
    Characteristic[key] = type_uuids[key];
}
