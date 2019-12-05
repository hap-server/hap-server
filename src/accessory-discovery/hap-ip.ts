
import Logger from '../common/logger';
import {AccessoryDiscovery, DiscoveredAccessory} from '../server/plugins';

// @ts-ignore
const IPDiscovery: typeof import('hap-controller').IPDiscovery | undefined = (() => {
    try {
        return require('hap-controller').IPDiscovery;
    } catch (err) {}
})();

import setup from '../accessory-setup/hap-ip';

const log = new Logger('HAP IP Discovery');

export const HAPIPDiscovery = AccessoryDiscovery.withHandler(accessory_discovery => {
    if (!IPDiscovery) {
        throw new Error('hap-controller is not available');
    }

    log.info('Starting HAP IP discovery');

    const discovery = new IPDiscovery();
    const accessories: Record<string, DiscoveredAccessory> = {};

    discovery.on('serviceUp', (service: any) => {
        if (accessories[service.id]) return;

        log.debug('New service', service);

        // TODO: ignore if already paired

        accessory_discovery.addAccessory(accessories[service.id] = new DiscoveredAccessory(/* plugin */ null, {
            username: service.id,
            name: service.name,
            address: service.address,
            port: service.port,
        }));
    });

    discovery.on('serviceDown', (service: any) => {
        log.debug('Removed service', service);

        accessory_discovery.removeAccessory(accessories[service.id]);
        accessories[service.id] = null;
    });

    discovery.start();

    return discovery;
}, (accessory_discovery, discovery) => {
    log.info('Stopping HAP IP discovery');

    discovery.stop();
});

export default new HAPIPDiscovery(null, 'HAPIP', setup);
