import Bridge from './bridge';
import HAPServer from './hap-server';
import PluginManager from './plugins';

import {statSync} from 'fs';

import {Bridge as HAPBridge, Accessory} from 'hap-nodejs';
import {HomebridgeConfig, Server as HomebridgeServer} from 'homebridge/lib/server';
import {PluginManager as HomebridgePluginManager} from 'homebridge/lib/pluginManager';
import {Logger as HomebridgeLogger} from 'homebridge/lib/logger';

// Types
import Server from './server';
import Logger from '../common/logger';

// @ts-expect-error
HomebridgeLogger.internal.prefix = 'Homebridge';

export default class Homebridge extends Bridge {
    readonly homebridge: HomebridgeServer;
    private _started: boolean;

    constructor(server: Server, log: Logger, config: HomebridgeConfig, unauthenticated_access = false) {
        const homebridge = new HomebridgeServer({
            config,
            keepOrphanedCachedAccessories: true,
            hideQRCode: true,
            insecureAccess: unauthenticated_access,
        });

        // @ts-expect-error
        homebridge.printSetupInfo = (() => undefined) as () => undefined;

        // Add all plugin paths to Homebridge

        // @ts-expect-error
        const plugin_manager: HomebridgePluginManager = homebridge.pluginManager;
        // @ts-expect-error
        const plugin_search_path: Set<string> = plugin_manager.searchPaths;

        for (const path of PluginManager.plugin_paths) {
            try {
                const stat = statSync(path);
                // eslint-disable-next-line no-throw-literal
                if (!stat.isDirectory()) throw {code: 'ENOTDIR'};

                plugin_search_path.add(path);
            } catch (err) {
                if (err.code === 'ENOENT') continue;
                if (err.code !== 'ENOTDIR') throw err;

                log.debug('Not adding "%s" as a plugin path for Homebridge as it\'s not a directory', path);
            }
        }

        // @ts-expect-error
        const bridge: HAPBridge = homebridge.bridge;

        super(server, log, {
            uuid: bridge.UUID,
            username: config.bridge.username,
            port: config.bridge.port,
            pincode: config.bridge.pin,
            unauthenticated_access,

            homebridge,
        });

        this.homebridge = homebridge;
        this._started = false;
    }

    protected _createBridge(config: {homebridge: HomebridgeServer}) {
        // @ts-expect-error
        const bridge: HAPBridge = config.homebridge.bridge;

        // @ts-expect-error
        bridge.handleInitialPairSetupFinished =
            // @ts-expect-error
            this.handleInitialPairSetupFinished.bind(this, bridge, bridge.handleInitialPairSetupFinished);
        // @ts-expect-error
        bridge.handleAddPairing = this.handleAddPairing.bind(this, bridge, bridge.handleAddPairing);
        // @ts-expect-error
        bridge.handleAddPairing = this.handleRemovePairing.bind(this, bridge, bridge.handleRemovePairing);

        return bridge;
    }

    private handleInitialPairSetupFinished<A extends unknown[]>(
        bridge: HAPBridge, handleInitialPairSetupFinished: (...args: A) => unknown, ...args: A
    ) {
        const r = handleInitialPairSetupFinished.call(bridge, ...args);

        this.server.accessories.handlePairingsUpdate(this);

        return r;
    }

    private handleAddPairing<A extends unknown[]>(
        bridge: HAPBridge, handleAddPairing: (...args: A) => unknown, ...args: A
    ) {
        const r = handleAddPairing.call(bridge, ...args);

        this.server.accessories.handlePairingsUpdate(this);

        return r;
    }

    private handleRemovePairing<A extends unknown[]>(
        bridge: HAPBridge, handleRemovePairing: (...args: A) => unknown, ...args: A
    ) {
        const r = handleRemovePairing.call(bridge, ...args);

        this.server.accessories.handlePairingsUpdate(this);

        return r;
    }

    publish() {
        if (this._started) return;

        this.homebridge.start();
        this._started = true;
    }

    unpublish() {
        if (!this._started) return;

        this.homebridge.teardown();
        this._started = false;
    }

    get hap_server(): HAPServer {
        throw new Error('Cannot create a HAPServer for Homebridge');
    }

    get accessory_info() {
        return this.bridge._accessoryInfo!;
    }

    get identifier_cache() {
        return this.bridge._identifierCache!;
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
