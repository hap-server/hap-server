
import Logger from '../common/logger';
import {AccessoryDiscovery, DiscoveredAccessory} from '../server/plugins';

// @ts-ignore
const BLEDiscovery: typeof import('hap-controller').BLEDiscovery | undefined = (() => {
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
    const accessories: Record<string, DiscoveredAccessory> = {};

    discovery.on('serviceUp', (service: any) => {
        if (accessories[service.DeviceID]) return;

        log.debug('New service', service);

        // TODO: ignore if already paired

        accessory_discovery.addAccessory(accessories[service.DeviceID] = new DiscoveredAccessory(/* plugin */ null, {
            username: service.DeviceID,
            name: service.name,
        }));
    });

    discovery.on('serviceDown', (service: any) => {
        log.debug('Removed service', service);

        accessory_discovery.removeAccessory(data => data.username === service.DeviceID);
        delete accessories[service.DeviceID];
    });

    discovery.start();

    return discovery;
}, (accessory_discovery, discovery) => {
    log.info('Stopping HAP BLE discovery');

    discovery.stop();
});

export default new HAPBLEDiscovery(null, 'HAPBLE', setup);
