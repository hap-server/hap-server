
import Logger from '../core/logger';
import {AccessoryDiscovery, DiscoveredAccessory} from '../core/plugins';
import {IPDiscovery} from 'hap-controller';

const log = new Logger('HAP IP Discovery');

export const HAPIPDiscovery = AccessoryDiscovery.withHandler(accessory_discovery => {
    log.info('Starting HAP IP discovery');

    const discovery = new IPDiscovery();
    const accessories = {};

    discovery.on('serviceUp', service => {
        if (accessories[service.id]) return;

        log.debug('New service', service);

        // TODO: ignore if already paired

        accessory_discovery.addAccessory(accessories[service.id] = new DiscoveredAccessory(/* plugin */ null, {
            transport: 'ip',

            username: service.id,
            name: service.name,
            address: service.address,
            port: service.port,
        }));
    });

    discovery.on('serviceDown', service => {
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

export default new HAPIPDiscovery();
