
import Logger from '../core/logger';
import {Accessory, Service, Characteristic} from '../core/hap-async';
import {AccessoryPlatform} from '../core/plugins';
import {uuid} from 'hap-nodejs';
import {HttpClient} from 'hap-controller';

const log = new Logger('HAP IP Accessory');

export default class HAPIP extends AccessoryPlatform {
    async init(cached_accessories) {
        this.client = new HttpClient(this.config.id, this.config.address, this.config.port, this.config.pairing_data);
        const {accessories} = await this.client.getAccessories();

        await Promise.all(accessories.map(async (hap_accessory, index) => {
            log.info('Accessory #%d', index, hap_accessory);

            const accessory = await this.createAccessoryFromHAP(hap_accessory);

            this.addAccessory(accessory);
        }));

        // TODO: watch the advertisment and update accessories when the configuration changes

        // Once we've registered all accessories from the bridge we can clear any remaining cached accessories
        this.removeAllCachedAccessories();
    }

    async createAccessoryFromHAP(hap_accessory) {
        // The name will be replaced later
        const accessory = new Accessory('Accessory', uuid.generate(this.config.uuid + ':' + hap_accessory.aid));

        // Remove the AccessoryInformation service created by hap-nodejs
        for (const service of accessory.services) accessory.removeService(service);

        for (const hap_service of hap_accessory.services) {
            if (hap_service.type.length === 2) {
                hap_service.type = '000000' + hap_service.type + '-0000-1000-8000-0026BB765291';
            }

            const service = new Service(null, hap_service.type, hap_service.iid);

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

                characteristic.updateValue(hap_characteristic.value);

                characteristic.on('get', async () => this.client.getCharacteristics([
                    hap_accessory.aid + '.' + hap_characteristic.iid,
                ], {
                    //
                }).then(characteristics => characteristics[0].value));

                characteristic.on('set', async value => this.client.setCharacteristics({
                    [hap_accessory.aid + '.' + hap_characteristic.iid]: value,
                }));

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
}

Object.defineProperty(HAPIP, 'name', {value: 'HomeKitIP'});
