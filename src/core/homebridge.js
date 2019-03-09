
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

            homebridge,
        });

        this.homebridge = homebridge;
    }

    _createBridge(config) {
        return config.homebridge._bridge;
    }

    publish() {
        this.homebridge.run();
    }

    unpublish() {
        this.homebridge._teardown();
    }

    assignIDs(accessory) {
        throw new Error('Cannot assign IDs for Homebridge');
    }

    handleAccessories(accessory) {
        throw new Error('Cannot handle /accessories requests for Homebridge');
    }

    cachedAccessoriesHAP(accessory) {
        return [];
    }

    addAccessory(accessory) {
        throw new Error('Cannot add accessory to Homebridge');
    }

    removeAccessory(accessory) {
        throw new Error('Cannot remove accessory from Homebridge');
    }

    addCachedAccessory(accessory) {
        throw new Error('Cannot add accessory to Homebridge');
    }

    removeCachedAccessory(accessory) {
        throw new Error('Cannot remove accessory from Homebridge');
    }

    removeAllCachedAccessories() {
        throw new Error('Cannot remove accessory from Homebridge');
    }
}
