
import Bridge from './bridge';

import {Server as HomebridgeServer} from 'homebridge/lib/server';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import {_system as homebridge_logger} from 'homebridge/lib/logger';

homebridge_logger.prefix = 'Homebridge';

export default class Homebridge extends Bridge {
    readonly homebridge: HomebridgeServer;

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

    protected _createBridge(config) {
        const bridge = config.homebridge._bridge;

        bridge._handlePair = this._handlePair.bind(this, bridge, bridge._handlePair);
        bridge._handleUnpair = this._handleUnpair.bind(this, bridge, bridge._handleUnpair);

        return bridge;
    }

    private _handlePair(bridge, handlePair, ...args) {
        const r = handlePair.call(bridge, ...args);

        this.server.handlePairingsUpdate(this);

        return r;
    }

    private _handleUnpair(bridge, handleUnpair, ...args) {
        const r = handleUnpair.call(bridge, ...args);

        this.server.handlePairingsUpdate(this);

        return r;
    }

    publish() {
        this.homebridge.run();
    }

    unpublish() {
        this.homebridge._teardown();
    }

    get hap_server() {
        throw new Error('Cannot create a HAPServer for Homebridge');
    }

    get accessory_info() {
        return this.bridge._accessoryInfo;
    }

    get identifier_cache() {
        return this.bridge._identifierCache;
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
