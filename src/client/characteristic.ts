/// <reference path="../types/hap-nodejs" />

import EventEmitter from 'events';
import Client from './client';

import {Characteristic as HAPCharacteristic} from 'hap-nodejs/lib/Characteristic';
import 'hap-nodejs/lib/gen/HomeKitTypes';
import Service from './service';

import {CharacteristicHap, CharacteristicPerms, CharacteristicFormat} from '../common/types/hap';

class Characteristic extends EventEmitter {
    static Formats: {[key: string]: string};
    static Units: {[key: string]: string};
    static Perms: {[key: string]: string};

    readonly service: Service;
    readonly uuid: string;

    private _details!: CharacteristicHap;
    private _permissions!: boolean;

    _subscribed = false;
    subscription_dependencies = new Set<any>();
    _getting: Promise<void> | null = null;
    _target_value: any = null;
    _setting: any[] = [];
    error: any = null;

    /**
     * Creates a Characteristic.
     *
     * @param {Service} service
     * @param {string} uuid
     * @param {object} details The HAP characteristic data (read only)
     * @param {boolean} permissions Whether the user can set this characteristic
     */
    constructor(service: Service, uuid: string, details: CharacteristicHap, permissions: boolean) {
        super();

        this.service = service;
        this.uuid = uuid;
        this._setDetails(details || {
            iid: 0, type: null, perms: [], format: CharacteristicFormat.DATA, description: '',
        });
        this._setPermissions(permissions);
    }

    get details(): CharacteristicHap {
        return this._details;
    }

    _setDetails(details: CharacteristicHap) {
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

    get perms(): CharacteristicPerms[] {
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

    get max_length() {
        return this.details.maxLen;
    }

    get updating() {
        return !!this._getting;
    }

    updateValue() {
        if (this._getting) return this._getting;

        return this._getting = this._updateValue().then(() => {
            this._getting = null;
        }, err => {
            this._getting = null;
            throw err;
        });
    }

    private async _updateValue() {
        try {
            const details = await this.service.accessory.connection.getCharacteristic(
                this.service.accessory.uuid, this.service.uuid, this.uuid);

            this._setDetails(details[0]);
            this.error = null;
        } catch (err) {
            this.error = err;
            throw err;
        }
    }

    async setValue(value: any) {
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

    validateValue(value: any) {
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
        return !!this.service.accessory.connection.subscribe_queue &&
            !!this.service.accessory.connection.subscribe_queue.find(q => q[0] === this);
    }

    get unsubscribing() {
        return !!this.service.accessory.connection.unsubscribe_queue &&
            !!this.service.accessory.connection.unsubscribe_queue.find(q => q[0] === this);
    }

    subscribe(dep?: any) {
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

    unsubscribe(dep?: any) {
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

    static async unsubscribeAll(dep: any) {
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

    _setPermissions(permissions: boolean) {
        this._permissions = !!permissions;

        this.emit('permissions-updated', !!permissions);
    }

    get can_get() {
        return this.perms.includes(CharacteristicPerms.PAIRED_READ);
    }

    get can_set() {
        return this._permissions && this.perms.includes(CharacteristicPerms.PAIRED_WRITE);
    }

    get can_subscribe() {
        return this.perms.includes(CharacteristicPerms.EVENTS);
    }

    static get types() {
        return type_uuids;
    }
}

type CharacteristicEvents = {
    'value-updated': (this: Characteristic, value: any, old_value: any) => void;
    'details-updated': (this: Characteristic) => void;
    'updated': (this: Characteristic) => void;
    'permissions-updated': (this: Characteristic, permissions: boolean) => void;
};

interface Characteristic {
    addListener<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    on<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    once<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    prependListener<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    prependOnceListener<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    removeListener<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    off<E extends keyof CharacteristicEvents>(event: E, listener: CharacteristicEvents[E]): this;
    removeAllListeners<E extends keyof CharacteristicEvents>(event: E): this;
    listeners<E extends keyof CharacteristicEvents>(event: E): CharacteristicEvents[E][];
    rawListeners<E extends keyof CharacteristicEvents>(event: E): CharacteristicEvents[E][];

    emit<E extends keyof CharacteristicEvents>(event: E, ...data: any[]): boolean;

    eventNames(): (keyof CharacteristicEvents)[];
    listenerCount<E extends keyof CharacteristicEvents>(type: E): number;
}

export default Characteristic;

const subscribed_characteristics = new Map();

export const types: {[name: string]: typeof HAPCharacteristic} = {};
export const type_uuids: {[name: string]: /** UUID */ string} = {};
export const type_names: {[uuid: string]: /** Name */ string} = {};

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
    // @ts-ignore
    Characteristic[key] = type_uuids[key];
}
