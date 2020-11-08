import {TypedEmitter} from 'tiny-typed-emitter';
import Client from './client';

import {Characteristic as HAPCharacteristic, CharacteristicProps} from 'hap-nodejs/dist/lib/Characteristic';
import 'hap-nodejs/dist/lib/definitions';
import Service from './service';

import {CharacteristicHap, CharacteristicPerms, CharacteristicFormat} from '../common/types/hap';

export default class Characteristic extends TypedEmitter<CharacteristicEvents> {
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

    get type_name(): string | null {
        return type_names[this.type] || null;
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
        const validClientSuppliedValue:
        (this: {props: Partial<CharacteristicProps>, value: unknown}, value: unknown) => boolean =
            // @ts-expect-error
            HAPCharacteristic.prototype.validClientSuppliedValue;

        return validClientSuppliedValue.call({
            props: {
                format: this.format,
                maxLen: this.max_length,
                maxDataLen: undefined,
                maxValue: this.max_value,
                minValue: this.min_value,
                minStep: this.min_step,
                validValues: this.valid_values,
                validValueRanges: this.valid_values_range,
            },
            value: this.value,
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

interface CharacteristicEvents {
    'value-updated': (this: Characteristic, value: any, old_value: any) => void;
    'details-updated': (this: Characteristic) => void;
    'updated': (this: Characteristic) => void;
    'permissions-updated': (this: Characteristic, permissions: boolean) => void;
}

const subscribed_characteristics = new Map();

export const types: {[name: string]: PredefinedCharacteristic} = {};
export const type_uuids: {[name: string]: /** UUID */ string} = {};
export const type_names: {[uuid: string]: /** Name */ string} = {};

interface PredefinedCharacteristic {
    new (): Characteristic;
}

const isPredefinedCharacteristic = (a: any): a is PredefinedCharacteristic =>
    a && a.prototype instanceof HAPCharacteristic;

for (const key of Object.keys(HAPCharacteristic) as (keyof typeof HAPCharacteristic)[]) {
    if (isPredefinedCharacteristic(HAPCharacteristic[key])) {
        // @ts-ignore
        types[key] = HAPCharacteristic[key];
        // @ts-ignore
        type_uuids[key] = HAPCharacteristic[key].UUID;
        // @ts-ignore
        type_names[HAPCharacteristic[key].UUID] = key;
    }
}

for (const key of Object.keys(type_uuids)) {
    // @ts-ignore
    Characteristic[key] = type_uuids[key];
}
