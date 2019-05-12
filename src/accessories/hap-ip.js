
import Logger from '../core/logger';
import {AccessoryPlatform} from '../core/plugins';
import {Accessory, Service, Characteristic, uuid} from 'hap-nodejs';
import {HttpClient} from 'hap-controller';

const log = new Logger('HAP IP Accessory');
const ServiceMap = Symbol('ServiceMap');
const CharacteristicMap = Symbol('CharacteristicMap');

export default class HAPIP extends AccessoryPlatform {
    async init(cached_accessories) {
        this.client = new HttpClient(this.config.id, this.config.address, this.config.port, this.config.pairing_data);

        this.client.on('event', event => {
            log.info('Received event', event);

            try {
                for (const hap_characteristic of event.characteristics) {
                    const accessory_uuid = uuid.generate(this.config.uuid + ':' + hap_characteristic.aid);
                    const accessory = this.accessories.find(plugin_accessory => plugin_accessory.uuid === accessory_uuid).accessory;
                    const characteristic = accessory[CharacteristicMap].get(hap_characteristic.iid);

                    characteristic.updateValue(hap_characteristic.value);
                }
            } catch (err) {
                log.error('Error handling event', event, err);
            }
        });

        const {accessories} = await this.client.getAccessories();
        const subscribe_characteristics = [];

        await Promise.all(accessories.map(async (hap_accessory, index) => {
            const accessory = await this.createAccessoryFromHAP(hap_accessory, subscribe_characteristics);

            this.addAccessory(accessory);
        }));

        this.events_connection = await this.client.subscribeCharacteristics(subscribe_characteristics);
        // await this.client.unsubscribeCharacteristics(subscribe_characteristics, this.events_connection);

        // TODO: watch the advertisment and update accessories when the configuration changes

        // Once we've registered all accessories from the bridge we can clear any remaining cached accessories
        this.removeAllCachedAccessories();
    }

    async createAccessoryFromHAP(hap_accessory, subscribe_characteristics) {
        // The name will be replaced later
        const accessory = new Accessory('Accessory', uuid.generate(this.config.uuid + ':' + hap_accessory.aid));

        accessory[ServiceMap] = new Map();
        accessory[CharacteristicMap] = new Map();

        // Remove the AccessoryInformation service created by hap-nodejs
        for (const service of accessory.services) accessory.removeService(service);

        for (const hap_service of hap_accessory.services) {
            if (hap_service.type.length === 2) {
                hap_service.type = '000000' + hap_service.type + '-0000-1000-8000-0026BB765291';
            }

            // subtype must be a string
            const service = new Service(null, hap_service.type, '' + hap_service.iid);

            accessory[ServiceMap].set(hap_service.iid, service);

            for (const hap_characteristic of hap_service.characteristics) {
                if (hap_characteristic.type.length === 2) {
                    hap_characteristic.type = '000000' + hap_characteristic.type + '-0000-1000-8000-0026BB765291';
                }

                if (hap_service.type === Service.AccessoryInformation.UUID &&
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

                accessory[CharacteristicMap].set(hap_characteristic.iid, characteristic);

                characteristic.updateValue(hap_characteristic.value);

                characteristic.on('get', this.handleCharacteristicGet.bind(this, accessory, hap_accessory, service,
                    hap_service, characteristic, hap_characteristic));
                characteristic.on('set', this.handleCharacteristicSet.bind(this, accessory, hap_accessory, service,
                    hap_service, characteristic, hap_characteristic));

                subscribe_characteristics.push(hap_accessory.aid + '.' + hap_characteristic.iid);

                service.addCharacteristic(characteristic);
            }

            service.isPrimaryService = !!hap_service.primary;
            service.isHiddenService = !!hap_service.hidden;

            accessory.addService(service);
        }

        for (const hap_service of hap_accessory.services) {
            if (!hap_service.linked || !hap_service.linked.length) continue;

            const service = accessory.services.find(s => s.UUID === hap_service.type && s.subtype === hap_service.iid);

            for (const linked_service_iid of hap_service.linked) {
                const linked_service = accessory.services.find(s => s.subtype === hap_service.iid);
                if (!linked_service) continue;

                service.addLinkedService(linked_service);
            }
        }

        return accessory;
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
        accessory, hap_accessory, service, hap_service, characteristic, hap_characteristic, callback
    ) {
        this.queueCharacteristicGet(hap_accessory.aid, hap_characteristic.iid)
            .then(c => callback(null, c.value), callback);
    }

    /**
     * Queues a characteristic get event.
     *
     * @param {number} aid
     * @param {number} iid
     * @return {Promise<>}
     */
    queueCharacteristicGet(aid, iid) {
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
        clearTimeout(this.get_queue_timeout);

        this.get_queue = null;
        this.get_queue_timeout = null;

        try {
            const {characteristics} = await this.client.getCharacteristics(queue.map(q => q[0]));

            // eslint-disable-next-line guard-for-in
            for (const index in characteristics) {
                queue[index][1].call(null, characteristics[index]);
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
     * @param {} value
     * @param {function} callback
     */
    handleCharacteristicSet(
        accessory, hap_accessory, service, hap_service, characteristic, hap_characteristic, value, callback
    ) {
        this.queueCharacteristicSet(hap_accessory.aid, hap_characteristic.iid, value)
            .then(v => callback(null, v), callback);
    }

    /**
     * Queues a characteristic set event.
     *
     * @param {number} aid
     * @param {number} iid
     * @param {} value
     * @return {Promise<>}
     */
    queueCharacteristicSet(aid, iid, value) {
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
        clearTimeout(this.set_queue_timeout);

        this.set_queue = null;
        this.set_queue_timeout = null;

        log.debug('Setting characteristics', queue);

        try {
            const {characteristics} = await this.client.setCharacteristics(queue
                .reduce((acc, cur) => (acc[cur[0]] = cur[1], acc), {}));

            log.debug('Set characteristics', characteristics);

            // eslint-disable-next-line guard-for-in
            for (const index in characteristics) {
                queue[index][2].call(null, characteristics[index]);
            }
        } catch (err) {
            for (const q of queue) {
                q[3].call(null, err);
            }
        }
    }
}

Object.defineProperty(HAPIP, 'name', {value: 'HomeKitIP'});
