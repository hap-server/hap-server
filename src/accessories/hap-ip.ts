
import Logger from '../common/logger';
import {AccessoryPlatform} from '../server/plugins';
import {uuid} from 'hap-nodejs';
import * as hap from 'hap-nodejs';

const HttpClient = (() => {
    try {
        return require('hap-controller').HttpClient;
    } catch (err) {}
})();

const log = new Logger('HAP IP Accessory');
const IID = Symbol('IID');
const ServiceMap = Symbol('ServiceMap');
const CharacteristicMap = Symbol('CharacteristicMap');

// Types
// @ts-ignore
import {HttpClient} from 'hap-controller';
import {
    AccessoryHap,
    ServiceHap,
    CharacteristicHap,
    CharacteristicFormat,
    CharacteristicPerms,
    CharacteristicUnit,
} from '../common/types/hap';

interface HAPAccessories {
    accessories: AccessoryHap[];
}

const Accessory = hap.Accessory;
interface Accessory extends HAPNodeJS.Accessory {
    [IID]?: number;
    [ServiceMap]?: Map</** iid */ number, Service>;
    [CharacteristicMap]?: Map</** iid */ number, Characteristic>;
}
const Service = hap.Service;
interface Service extends HAPNodeJS.Service {
    [IID]?: number;
    [ServiceMap]?: Map</** iid */ number, Service>;
    [CharacteristicMap]?: Map</** iid */ number, Characteristic>;
}
const Characteristic = hap.Characteristic;
interface Characteristic extends HAPNodeJS.Characteristic {
    UUID: string;
    displayName: string;
    [IID]?: number;
    [ServiceMap]?: Map</** iid */ number, Service>;
    [CharacteristicMap]?: Map</** iid */ number, Characteristic>;
}

export default class HAPIP extends AccessoryPlatform {
    config!: {
        plugin: undefined;
        platform: 'HomeKitIP';
        name: string;
        uuid: string; // Set by hap-server if not set by the user

        id: string; // Same as hap-nodejs usernames
        address: string;
        port: number;
        pairing_data: any;
    };

    client: HttpClient;
    events_connection: any;
    subscribed_characteristics: string[] = [];

    private get_queue: [
        /** aid, iid pair */ string, /** resolve */ (v: any) => void, /** reject */ (r: any) => void,
    ][] | null = null;
    private get_queue_timeout?: NodeJS.Timeout = undefined;
    private set_queue: [
        /** aid, iid pair */ string, /** value */ any, /** resolve */ (v: any) => void,
        /** reject */ (r: any) => void,
    ][] | null = null;
    private set_queue_timeout?: NodeJS.Timeout = undefined;
    private subscribe_queue: [
        /** aid, iid pair */ string, /** value */ boolean, /** resolve */ (v: any) => void,
        /** reject */ (r: any) => void,
    ][] | null = null;
    private subscribe_queue_timeout?: NodeJS.Timeout = undefined;

    async init(cached_accessories: Accessory[]) {
        if (!HttpClient) {
            throw new Error('hap-controller is not available');
        }

        this.client = new HttpClient(this.config.id, this.config.address, this.config.port, this.config.pairing_data);

        this.client.on('event', (event: any) => {
            log.info('Received event', event);

            for (const hap_characteristic of event.characteristics) {
                try {
                    const accessory_uuid = uuid.generate(this.config.uuid + ':' + hap_characteristic.aid);
                    const accessory: Accessory = this.accessories.find(plugin_accessory =>
                        plugin_accessory.uuid === accessory_uuid)!.accessory;
                    const characteristic = (accessory as any)[CharacteristicMap].get(hap_characteristic.iid);

                    characteristic.updateValue(hap_characteristic.value);
                } catch (err) {
                    log.error('Error updating characteristic', hap_characteristic, err);
                }
            }
        });

        const {accessories} = await this.client.getAccessories();
        const subscribe_characteristics: string[] = [];

        for (const hap_accessory of accessories) {
            if (hap_accessory.aid === 1 && (!hap_accessory.services.length || (hap_accessory.services.length === 1 &&
                (hap_accessory.services[0].type === Service.AccessoryInformation.UUID ||
                    '000000' + hap_accessory.services[0].type + '-0000-1000-8000-0026BB765291' ===
                        Service.AccessoryInformation.UUID)))
            ) {
                // If this is the first accessory and it only has an AccessoryInformation service it's probably
                // just a placeholder for a bridge
                continue;
            }

            const accessory = this.createAccessoryFromHAP(hap_accessory, subscribe_characteristics);

            this.addAccessory(accessory);
        }

        this.events_connection = await this.client.subscribeCharacteristics(subscribe_characteristics);
        this.subscribed_characteristics = subscribe_characteristics;
        // await this.client.unsubscribeCharacteristics(subscribe_characteristics, this.events_connection);

        // TODO: watch the advertisment and update accessories when the configuration changes

        // Once we've registered all accessories from the bridge we can clear any remaining cached accessories
        this.removeAllCachedAccessories();
    }

    createAccessoryFromHAP(hap_accessory: AccessoryHap, subscribe_characteristics: string[]) {
        // The name will be replaced later
        const accessory: Accessory =
            new Accessory('Accessory', uuid.generate(this.config.uuid + ':' + hap_accessory.aid));

        accessory[IID] = hap_accessory.aid;
        accessory[ServiceMap] = new Map();
        accessory[CharacteristicMap] = new Map();

        // Remove the AccessoryInformation service created by hap-nodejs
        for (const service of accessory.services) accessory.removeService(service);

        for (const hap_service of hap_accessory.services) {
            const service = this.createServiceFromHAP(accessory, hap_accessory, hap_service, subscribe_characteristics);

            accessory.addService(service);
        }

        for (const hap_service of hap_accessory.services) {
            if (!hap_service.linked || !hap_service.linked.length) continue;

            const service = accessory.services
                .find(s => s.UUID === hap_service.type && s.subtype === '' + hap_service.iid);

            for (const linked_service_iid of hap_service.linked) {
                const linked_service = (accessory as any)[ServiceMap].get(linked_service_iid);
                if (!linked_service) continue;

                (service as any).addLinkedService(linked_service);
            }
        }

        return accessory;
    }

    createServiceFromHAP(
        accessory: Accessory, hap_accessory: AccessoryHap, hap_service: ServiceHap, subscribe_characteristics: string[]
    ) {
        if (hap_service.type.length === 2) {
            hap_service.type = '000000' + hap_service.type + '-0000-1000-8000-0026BB765291';
        }

        // subtype must be a string
        const service = new Service(null, hap_service.type, '' + hap_service.iid);

        service[IID] = hap_service.iid;
        (accessory as any)[ServiceMap].set(hap_service.iid, service);

        for (const hap_characteristic of hap_service.characteristics) {
            const characteristic = this.createCharacteristicFromHAP(accessory, hap_accessory,
                service, hap_service, hap_characteristic, subscribe_characteristics);

            service.addCharacteristic(characteristic);
        }

        service.isPrimaryService = !!hap_service.primary;
        service.isHiddenService = !!hap_service.hidden;

        return service;
    }

    createCharacteristicFromHAP(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap,
        hap_characteristic: CharacteristicHap, subscribe_characteristics?: string[]
    ) {
        if (hap_characteristic.type.length === 2) {
            hap_characteristic.type = '000000' + hap_characteristic.type + '-0000-1000-8000-0026BB765291';
        }

        if (service.UUID === Service.AccessoryInformation.UUID &&
            hap_characteristic.type === Characteristic.Name.UUID
        ) {
            accessory.displayName = hap_characteristic.value;
        }

        const characteristic = new Characteristic(hap_characteristic.description, hap_characteristic.type, {
            perms: hap_characteristic.perms,
            format: hap_characteristic.format,
            validValues: hap_characteristic['valid-values'],
            validValuesRange: hap_characteristic['valid-values-range'],
            unit: hap_characteristic.unit,
            maxValue: hap_characteristic.maxValue,
            minValue: hap_characteristic.minValue,
            minStep: hap_characteristic.minStep,
        });

        characteristic[IID] = hap_characteristic.iid;
        (accessory as any)[CharacteristicMap].set(hap_characteristic.iid, characteristic);

        characteristic.updateValue(hap_characteristic.value);

        // @ts-ignore
        characteristic.on('get', this.handleCharacteristicGet.bind(this, accessory, hap_accessory, service,
            hap_service, characteristic, hap_characteristic));
        characteristic.on('set', this.handleCharacteristicSet.bind(this, accessory, hap_accessory, service,
            hap_service, characteristic, hap_characteristic));
        // @ts-ignore
        characteristic.on('subscribe', this.handleCharacteristicSubscribe
            .bind(this, accessory, hap_accessory, service, hap_service, characteristic, hap_characteristic));
        // @ts-ignore
        characteristic.on('unsubscribe', this.handleCharacteristicUnsubscribe
            .bind(this, accessory, hap_accessory, service, hap_service, characteristic, hap_characteristic));

        // subscribe_characteristics.push(hap_accessory.aid + '.' + hap_characteristic.iid);

        return characteristic;
    }

    async updateAccessories() {
        const {accessories} = await this.client.getAccessories();

        await this.patchAccessories(accessories);
    }

    async patchAccessories(accessories: AccessoryHap[]) {
        const new_accessories: any[] = [];
        const existing_accessories: [Accessory, AccessoryHap][] = [];
        const removed_accessories: Accessory[] = [];
        const subscribe_characteristics: string[] = [];
        const patch_characteristics: Record<string, boolean> = {};

        for (const accessory of this.accessories) {
            const hap_accessory = accessories.find(a => (accessory.accessory as Accessory)[IID] === a.aid);

            if (hap_accessory) {
                existing_accessories.push([accessory.accessory, hap_accessory]);
            } else {
                removed_accessories.push(accessory.accessory);
            }
        }

        for (const hap_accessory of accessories) {
            if (existing_accessories.find(([, h]) => h === hap_accessory)) continue;

            new_accessories.push(hap_accessory);
        }

        for (const hap_accessory of new_accessories) {
            if (hap_accessory.aid === 1 && (!hap_accessory.services.length || (hap_accessory.services.length === 1 &&
                (hap_accessory.services[0].type === Service.AccessoryInformation.UUID ||
                    '000000' + hap_accessory.services[0].type + '-0000-1000-8000-0026BB765291' ===
                        Service.AccessoryInformation.UUID)))
            ) {
                // If this is the first accessory and it only has an AccessoryInformation service it's probably
                // just a placeholder for a bridge
                continue;
            }

            const accessory = this.createAccessoryFromHAP(hap_accessory, subscribe_characteristics);

            this.addAccessory(accessory);
        }

        for (const [accessory, hap_accessory] of existing_accessories) {
            this.patchAccessory(accessory, hap_accessory, subscribe_characteristics);
        }

        for (const accessory of removed_accessories) {
            this.removeAccessory(accessory);

            // We don't need to unsubscribe from any characteristics if they don't exist
            this.subscribed_characteristics = this.subscribed_characteristics
                .filter(cid => !cid.startsWith(accessory[IID] + '.'));
        }

        for (const cid of subscribe_characteristics) patch_characteristics[cid] = true;
        await this.patchSubscribedCharacteristics(patch_characteristics);
    }

    patchAccessory(accessory: Accessory, hap_accessory: AccessoryHap, subscribe_characteristics: string[]) {
        const new_services: any[] = [];
        const existing_services: [Service, ServiceHap][] = [];
        const removed_services: Service[] = [];

        for (const service of accessory.services) {
            const hap_service = hap_accessory.services.find(s => (service as Service)[IID] === s.iid);

            if (hap_service) {
                existing_services.push([service, hap_service]);
            } else {
                removed_services.push(service);
            }
        }

        for (const hap_service of hap_accessory.services) {
            if (existing_services.find(([, h]) => h === hap_service)) continue;

            new_services.push(hap_service);
        }

        for (const hap_service of new_services) {
            const service = this.createServiceFromHAP(accessory, hap_accessory, hap_service, subscribe_characteristics);

            accessory.addService(service);
        }

        for (const [service, hap_service] of existing_services) {
            this.patchService(accessory, hap_accessory, service, hap_service);
        }

        for (const service of removed_services) {
            accessory.removeService(service);

            // We don't need to unsubscribe from any characteristics if they don't exist
            const unsubscribed = service.characteristics.map(c => `${accessory[IID]}.${(c as Characteristic)[IID]}`);
            this.subscribed_characteristics = this.subscribed_characteristics
                .filter(cid => !unsubscribed.includes(cid));
        }
    }

    patchService(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap
    ) {
        const new_characteristics: any[] = [];
        const existing_characteristics: [Characteristic, CharacteristicHap][] = [];
        const removed_characteristics: Characteristic[] = [];

        for (const characteristic of service.characteristics as Characteristic[]) {
            const hap_characteristic = hap_service.characteristics.find(c => characteristic[IID] === c.iid)!;
            const type = hap_characteristic.type.length === 2 ? `000000${hap_characteristic.type}-0000-1000-8000-0026BB765291` : hap_characteristic.type;

            // If the type has changed, remove and replace the characteristic
            if (hap_characteristic && characteristic.UUID === type) {
                existing_characteristics.push([characteristic, hap_characteristic]);
            } else {
                removed_characteristics.push(characteristic);
            }
        }

        for (const hap_characteristic of hap_service.characteristics) {
            if (existing_characteristics.find(([, h]) => h === hap_characteristic)) continue;

            new_characteristics.push(hap_characteristic);
        }

        for (const hap_characteristic of new_characteristics) {
            const characteristic = this.createCharacteristicFromHAP(accessory, hap_accessory,
                service, hap_service, hap_characteristic);

            service.addCharacteristic(characteristic);
        }

        for (const [characteristic, hap_characteristic] of existing_characteristics) {
            this.patchCharacteristic(accessory, hap_accessory, service, hap_service,
                characteristic, hap_characteristic);
        }

        for (const characteristic of removed_characteristics) {
            service.removeCharacteristic(characteristic);

            // We don't need to unsubscribe from any characteristics if they don't exist
            this.subscribed_characteristics = this.subscribed_characteristics
                .filter(cid => cid !== `${accessory[IID]}.${characteristic[IID]}`);
        }
    }

    async patchCharacteristic(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap,
        characteristic: Characteristic, hap_characteristic: CharacteristicHap
    ) {
        if (hap_characteristic.type.length === 2) {
            hap_characteristic.type = '000000' + hap_characteristic.type + '-0000-1000-8000-0026BB765291';
        }

        if (service.UUID === Service.AccessoryInformation.UUID &&
            hap_characteristic.type === Characteristic.Name.UUID
        ) {
            accessory.displayName = hap_characteristic.value;
        }

        if (characteristic.UUID !== hap_characteristic.type) {
            throw new Error('Cannot change characteristic type');
        }

        characteristic.displayName = hap_characteristic.description;

        characteristic.setProps({
            perms: hap_characteristic.perms as unknown as HAPNodeJS.Characteristic.Perms[],
            format: hap_characteristic.format as unknown as HAPNodeJS.Characteristic.Formats,
            // @ts-ignore
            validValues: hap_characteristic['valid-values'],
            // @ts-ignore
            validValuesRange: hap_characteristic['valid-values-range'],
            unit: hap_characteristic.unit as unknown as HAPNodeJS.Characteristic.Units,
            // @ts-ignore
            maxValue: hap_characteristic.maxValue,
            // @ts-ignore
            minValue: hap_characteristic.minValue,
            // @ts-ignore
            minStep: hap_characteristic.minStep,
        });

        characteristic.updateValue(hap_characteristic.value);

        // characteristic.on('get', this.handleCharacteristicGet.bind(this, accessory, hap_accessory, service,
        //     hap_service, characteristic, hap_characteristic));
        // characteristic.on('set', this.handleCharacteristicSet.bind(this, accessory, hap_accessory, service,
        //     hap_service, characteristic, hap_characteristic));
        // characteristic.on('subscribe', this.handleCharacteristicSubscribe
        //     .bind(this, accessory, hap_accessory, service, hap_service, characteristic, hap_characteristic));
        // characteristic.on('unsubscribe', this.handleCharacteristicUnsubscribe
        //     .bind(this, accessory, hap_accessory, service, hap_service, characteristic, hap_characteristic));
    }

    /**
     * Handles characteristic get events.
     *
     * @param {Accessory} accessory
     * @param {object} hap_accessory
     * @param {Service} service
     * @param {object} hap_service
     * @param {Characteristic} characteristic
     * @param {object} hap_characteristic
     * @param {function} callback
     */
    handleCharacteristicGet(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap,
        characteristic: Characteristic, hap_characteristic: CharacteristicHap,
        callback: (err?: Error | null, value?: any) => void
    ) {
        this.queueCharacteristicGet(hap_accessory.aid, hap_characteristic.iid)
            .then(c => callback(null, c.value), callback);
    }

    /**
     * Queues a characteristic get event.
     *
     * @param {number} aid
     * @param {number} iid
     * @return {Promise<object>}
     */
    queueCharacteristicGet(aid: number, iid: number): Promise<{aid: number; iid: number; value: any; status: number}> {
        return new Promise((resolve, reject) => {
            const queue = this.get_queue || (this.get_queue = []);

            queue.push([aid + '.' + iid, resolve, reject]);

            if (typeof this.get_queue_timeout === 'undefined' || this.get_queue_timeout === null) {
                this.get_queue_timeout = setTimeout(() => this.processCharacteristicGetQueue(), 100);
            }
        });
    }

    async processCharacteristicGetQueue() {
        const queue = this.get_queue || [];
        clearTimeout(this.get_queue_timeout as any);

        this.get_queue = null;
        this.get_queue_timeout = undefined;

        try {
            const {characteristics} = await this.client.getCharacteristics(queue.map(q => q[0]));

            // eslint-disable-next-line guard-for-in
            for (const index in characteristics) {
                queue[index as unknown as number][1].call(null, characteristics[index]);
            }
        } catch (err) {
            for (const q of queue) {
                q[2].call(null, err);
            }
        }
    }

    /**
     * Handles characteristic set events.
     *
     * @param {Accessory} accessory
     * @param {object} hap_accessory
     * @param {Service} service
     * @param {object} hap_service
     * @param {Characteristic} characteristic
     * @param {object} hap_characteristic
     * @param {*} value
     * @param {function} callback
     */
    handleCharacteristicSet(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap,
        characteristic: Characteristic, hap_characteristic: CharacteristicHap,
        value: any, callback: (err?: Error | null, value?: any) => void
    ) {
        this.queueCharacteristicSet(hap_accessory.aid, hap_characteristic.iid, value)
            .then(v => callback(null, v), callback);
    }

    /**
     * Queues a characteristic set event.
     *
     * @param {number} aid
     * @param {number} iid
     * @param {*} value
     * @return {Promise<object>}
     */
    queueCharacteristicSet(aid: number, iid: number, value: any): Promise<{aid: number; iid: number; status: number}> {
        return new Promise((resolve, reject) => {
            const queue = this.set_queue || (this.set_queue = []);

            queue.push([aid + '.' + iid, value, resolve, reject]);

            log.debug('Queued characteristic set', queue);

            if (typeof this.set_queue_timeout === 'undefined' || this.set_queue_timeout === null) {
                this.set_queue_timeout = setTimeout(() => this.processCharacteristicSetQueue(), 100);
            }
        });
    }

    async processCharacteristicSetQueue() {
        const queue = this.set_queue || [];
        clearTimeout(this.set_queue_timeout as any);

        this.set_queue = null;
        this.set_queue_timeout = undefined;

        log.debug('Setting characteristics', queue);

        try {
            const {characteristics} = await this.client.setCharacteristics(queue
                .reduce((acc, cur) => (acc[cur[0]] = cur[1], acc), {} as Record<string, any>));

            log.debug('Set characteristics', characteristics);

            // eslint-disable-next-line guard-for-in
            for (const index in characteristics) {
                queue[index as unknown as number][2].call(null, characteristics[index]);
            }
        } catch (err) {
            for (const q of queue) {
                q[3].call(null, err);
            }
        }
    }

    /**
     * Handles characteristic subscribe events.
     *
     * @param {Accessory} accessory
     * @param {object} hap_accessory
     * @param {Service} service
     * @param {object} hap_service
     * @param {Characteristic} characteristic
     * @param {object} hap_characteristic
     */
    handleCharacteristicSubscribe(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap,
        characteristic: Characteristic, hap_characteristic: CharacteristicHap
    ) {
        this.queueCharacteristicSubscribe(hap_accessory.aid, hap_characteristic.iid, true);
    }

    /**
     * Handles characteristic subscribe events.
     *
     * @param {Accessory} accessory
     * @param {object} hap_accessory
     * @param {Service} service
     * @param {object} hap_service
     * @param {Characteristic} characteristic
     * @param {object} hap_characteristic
     */
    handleCharacteristicUnsubscribe(
        accessory: Accessory, hap_accessory: AccessoryHap, service: Service, hap_service: ServiceHap,
        characteristic: Characteristic, hap_characteristic: CharacteristicHap
    ) {
        this.queueCharacteristicSubscribe(hap_accessory.aid, hap_characteristic.iid, false);
    }

    /**
     * Queues a characteristic subscribe event.
     *
     * @param {number} aid
     * @param {number} iid
     * @param {boolean} subscribe
     * @return {Promise}
     */
    queueCharacteristicSubscribe(aid: number, iid: number, subscribe: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            const queue = this.subscribe_queue || (this.subscribe_queue = []);

            queue.push([aid + '.' + iid, subscribe, resolve, reject]);

            if (typeof this.subscribe_queue_timeout === 'undefined' || this.subscribe_queue_timeout === null) {
                this.subscribe_queue_timeout = setTimeout(() => this.processCharacteristicSubscribeQueue(), 100);
            }
        });
    }

    async processCharacteristicSubscribeQueue() {
        const queue = this.subscribe_queue || [];
        clearTimeout(this.subscribe_queue_timeout as any);

        this.subscribe_queue = null;
        this.subscribe_queue_timeout = undefined;

        try {
            const data: Record<string, boolean> = {};
            for (const q of queue) data[q[0]] = q[1];

            await this.patchSubscribedCharacteristics(data);

            // eslint-disable-next-line guard-for-in
            for (const q of queue) {
                q[2].call(null, null);
            }
        } catch (err) {
            for (const q of queue) {
                q[3].call(null, err);
            }
        }
    }

    async patchSubscribedCharacteristics(characteristics: {[key: string]: boolean}) {
        const data = {
            characteristics: [] as {
                aid: number;
                iid: number;
                ev: boolean;
            }[],
        };

        for (const [cid, subscribe] of Object.entries(characteristics)) {
            const parts = cid.split('.');
            data.characteristics.push({
                aid: parseInt(parts[0], 10),
                iid: parseInt(parts[1], 10),
                ev: !!subscribe,
            });
        }

        const response = await this.events_connection
            .put('/characteristics', Buffer.from(JSON.stringify(data)), undefined, true);

        if (response.statusCode !== 204 && response.statusCode !== 207) {
            throw new Error('Subscribe failed with status ' + response.statusCode);
        }

        let index;
        for (const [cid, subscribe] of Object.entries(characteristics)) {
            if (subscribe && this.subscribed_characteristics.indexOf(cid) <= -1) {
                this.subscribed_characteristics.push(cid);
            } else if (!subscribe) {
                while ((index = this.subscribed_characteristics.indexOf(cid)) > -1) {
                    this.subscribed_characteristics.splice(index, 1);
                }
            }
        }
    }
}

Object.defineProperty(HAPIP, 'name', {value: 'HomeKitIP'});
