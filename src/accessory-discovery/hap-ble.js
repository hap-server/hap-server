
import Logger from '../core/logger';
import {AccessoryDiscovery, DiscoveredAccessory} from '../core/plugins';

const BLEDiscovery = (() => {
    try {
        return require('hap-controller').BLEDiscovery;
    } catch (err) {}
})();

import setup from '../accessory-setup/hap-ble';

const log = new Logger('HAP BLE Discovery');

export const HAPBLEDiscovery = AccessoryDiscovery.withHandler(accessory_discovery => {
    if (!BLEDiscovery) {
        throw new Error('hap-controller is not available');
    }

    log.info('Starting HAP BLE Discovery');

    const discovery = new BLEDiscovery();
    const accessories = {};

    discovery.on('serviceUp', service => {
        if (accessories[service.DeviceID]) return;

        log.debug('New service', service);

        // TODO: ignore if already paired

        accessory_discovery.addAccessory(accessories[service.DeviceID] = new DiscoveredAccessory(/* plugin */ null, {
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

export default new HAPBLEDiscovery(null, 'HAPBLE', setup);
