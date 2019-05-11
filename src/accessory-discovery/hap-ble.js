
import Logger from '../core/logger';
import {AccessoryDiscovery, DiscoveredAccessory} from '../core/plugins';
import {BLEDiscovery} from 'hap-controller';

const log = new Logger('HAP BLE Discovery');

export const HAPBLEDiscovery = AccessoryDiscovery.withHandler(accessory_discovery => {
    log.info('Starting HAP BLE Discovery');

    const discovery = new BLEDiscovery();
    const accessories = {};

    discovery.on('serviceUp', service => {
        if (accessories[service.DeviceID]) return;

        log.debug('New service', service);

        // TODO: ignore if already paired

        accessory_discovery.addAccessory(accessories[service.DeviceID] = new DiscoveredAccessory(/* plugin */ null, {
            transport: 'ble',

            username: service.DeviceID,
            name: service.name,
        }));
    });

    discovery.on('serviceDown', service => {
        log.debug('Removed service', service);

        accessory_discovery.removeAccessory(data => data.username === service.DeviceID);
        accessories[service.DeviceID] = null;
    });

    discovery.start();

    return discovery;
}, (accessory_discovery, discovery) => {
    log.info('Stopping HAP BLE discovery');

    discovery.stop();
});

export default new HAPBLEDiscovery();
