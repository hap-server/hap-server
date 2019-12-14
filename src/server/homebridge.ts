/// <reference path="../types/homebridge.d.ts" />

import Bridge from './bridge';

import {Server as HomebridgeServer} from 'homebridge/lib/server';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import {_system as homebridge_logger} from 'homebridge/lib/logger';

// Types
import Server from './server';
import Logger from '../common/logger';
import {Accessory} from '../hap-nodejs';

homebridge_logger.prefix = 'Homebridge';

export default class Homebridge extends Bridge {
    readonly homebridge: HomebridgeServer;

    constructor(server: Server, log: Logger, config: any, unauthenticated_access = false) {
        HomebridgeUser.configPath = (() => undefined) as () => undefined;
        HomebridgeUser.config = () => config;

        const homebridge = new HomebridgeServer({
            config,
            insecureAccess: unauthenticated_access,
            hideQRCode: true,
        });

        homebridge._printSetupInfo = (() => undefined) as () => undefined;
        homebridge._printPin = (() => undefined) as () => undefined;
        homebridge._handleNewConfig = (() => undefined) as () => undefined;

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

    protected _createBridge(config: {homebridge: HomebridgeServer}) {
        const bridge = config.homebridge._bridge;

        bridge._handlePair = this._handlePair.bind(this, bridge, bridge._handlePair);
        bridge._handleUnpair = this._handleUnpair.bind(this, bridge, bridge._handleUnpair);

        return bridge;
    }

    private _handlePair(bridge: any, handlePair: any, ...args: any[]) {
        const r = handlePair.call(bridge, ...args);

        this.server.accessories.handlePairingsUpdate(this);

        return r;
    }

    private _handleUnpair(bridge: any, handleUnpair: any, ...args: any[]) {
        const r = handleUnpair.call(bridge, ...args);

        this.server.accessories.handlePairingsUpdate(this);

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

    addAccessory(accessory: Accessory) {
        throw new Error('Cannot add accessory to Homebridge');
    }

    removeAccessory(accessory: Accessory) {
        throw new Error('Cannot remove accessory from Homebridge');
    }

    addCachedAccessory(accessory: Accessory) {
        throw new Error('Cannot add accessory to Homebridge');
    }

    removeCachedAccessory(accessory: Accessory) {
        throw new Error('Cannot remove accessory from Homebridge');
    }

    removeAllCachedAccessories() {
        throw new Error('Cannot remove accessory from Homebridge');
    }
}
