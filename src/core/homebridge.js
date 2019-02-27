
import Bridge from './bridge';

import {Server as HomebridgeServer} from 'homebridge/lib/server';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import {_system as homebridge_logger} from 'homebridge/lib/logger';

homebridge_logger.prefix = 'Homebridge';

export default class Homebridge extends Bridge {
    constructor(server, log, config, unauthenticated_access) {
        HomebridgeUser.configPath = () => undefined;
        HomebridgeUser.config = () => config;

        const homebridge = new HomebridgeServer({
            config,
            insecureAccess: unauthenticated_access,
            hideQRCode: true,
        });

        homebridge._printSetupInfo = () => undefined;
        homebridge._printPin = () => undefined;
        homebridge._handleNewConfig = () => undefined;

        super(server, log, {
            uuid: homebridge._bridge.UUID,
            username: config.username,
            port: config.port,
            pincode: config.pincode,
            unauthenticated_access,
            _no_bridge: true,
        });

        this.log.info('Homebridge config', config);

        this.homebridge = homebridge;
        this.bridge = this.homebridge._bridge;

        this.bridge.on('service-characteristic-change', event => {
            // this.log.info('Updating characteristic', event);
            this.server.handleCharacteristicUpdate(event.accessory || this.bridge,
                event.service, event.characteristic, event.newValue, event.oldValue, event.context);
        });

        const addBridgedAccessory = this.bridge.addBridgedAccessory;

        this.bridge.addBridgedAccessory = (accessory, defer_update, ...args) => {
            accessory.on('service-characteristic-change', event => {
                // this.log.info('Updating characteristic', accessory, event);
                this.server.handleCharacteristicUpdate(event.accessory || accessory,
                    event.service, event.characteristic, event.newValue, event.oldValue, event.context);
            });

            return addBridgedAccessory.call(this.bridge, accessory, defer_update, ...args);
        };
    }

    publish() {
        this.homebridge.run();
    }

    unpublish() {
        this.homebridge._teardown();
    }

    addAccessory(accessory) {
        throw new Error('Cannot add accessory to Homebridge');
    }

    removeAccessory(accessory) {
        throw new Error('Cannot remove accessory from Homebridge');
    }
}
