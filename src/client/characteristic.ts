import EventEmitter from 'events';
import Client from './client';

import {Characteristic as HAPCharacteristic} from 'hap-nodejs/lib/Characteristic';
import 'hap-nodejs/lib/gen/HomeKitTypes';
import Service from './service';

export default class Characteristic extends EventEmitter {
    static Formats: {[key: string]: string};
    static Units: {[key: string]: string};
    static Perms: {[key: string]: string};

    readonly service: Service;
    readonly uuid: string;

    private _details;
    private _permissions;
    
    _subscribed = false;
    subscription_dependencies = new Set<any>();
    _getting = 0;
    _target_value = null;
    _setting: any[] = [];
    error;

    /**
     * Creates a Characteristic.
     *
     * @param {Service} service
     * @param {string} uuid
     * @param {object} details The HAP characteristic data (read only)
     * @param {boolean} permissions Whether the user can set this characteristic
     */
    constructor(service: Service, uuid: string, details, permissions) {
        super();

        this.service = service;
        this.uuid = uuid;
        this._setDetails(details || {});
        this._setPermissions(permissions);
        this._subscribed = false;
        this.subscription_dependencies = new Set();
        this._getting = 0;
        this._target_value = null;
        this._setting = [];
        this.error = null;
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

    get description(): string {
        return this.details.description;
    }

    get type(): string {
        return this.details.type;
    }

    get type_name(): string {
        return type_names[this.type];
    }

    get perms(): string[] {
        return this.details.perms;
    }

    get format(): string {
        return this.details.format;
    }

    get value() {
        return this.details.value;
    }

    get target_value() {
        if (this._target_value === null) return this.value;
        return this._target_value;
    }

    get changed() {
        return this.value !== this.target_value;
    }

    get valid_values(): string[] {
        return this.details['valid-values'];
    }

    get valid_values_range(): string[] {
        return this.details['valid-values-range'];
    }

    get unit(): string {
        return this.details.unit;
    }

    get max_value(): number {
        return this.details.maxValue;
    }

    get min_value(): number {
        return this.details.minValue;
    }

    get min_step(): number {
        return this.details.minStep;
    }

    get max_length(): number {
        return this.details.maxLen;
    }

    get updating() {
        return !!this._getting;
    }

    async updateValue() {
        try {
            this._getting++;

            const details = await this.service.accessory.connection.getCharacteristic(
                this.service.accessory.uuid, this.service.uuid, this.uuid);

            this._setDetails(details);
            this.error = null;
        } catch (err) {
            this.error = err;
            throw err;
        } finally {
            this._getting--;
        }
    }

    async setValue(value) {
        if (this.service.characteristics[this.uuid] !== this) {
            throw new Error('This characteristic no longer exists');
        }

        // if (!this.validateValue(value)) {
        //     throw new Error('Value is not valid');
        // }

        for (const queued of this._setting) queued[1].call();
        const setting: Promise<void> = (this._setting[this._setting.length - 1] || [Promise.resolve()])[0];

        let canceled = false;

        const promise = setting.then(() => {
            if (canceled) return;

            return this.service.accessory.connection.setCharacteristic(
                this.service.accessory.uuid, this.service.uuid, this.uuid, value);
        }).then(() => {
            if (canceled) return;

            this._target_value = null;
            this.error = null;
            this._setting.splice(0, this._setting.length);
        }, err => {
            this.error = err;
            throw err;
        });

        this._target_value = value;
        this._setting.push([promise, () => canceled = true]);
        return promise;
    }

    validateValue(value) {
        // hap-nodejs' validateValue tries to coerce the value to a valid value
        return value === HAPCharacteristic.prototype.validateValue.call({
            props: {
                format: this.format,
                maxLen: this.max_length,
                maxDataLen: undefined,
                maxValue: this.max_value,
                minValue: this.min_value,
                minStep: this.min_step,
            },
            value: this.value,
            ['valid-values']: this.valid_values,
            ['valid-values-range']: this.valid_values_range,
        }, value);
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

    subscribe(dep?) {
        if (this.service.characteristics[this.uuid] !== this ||
            this.service.accessory.services[this.service.uuid] !== this.service
        ) {
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

    unsubscribe(dep?) {
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
