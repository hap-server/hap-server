/// <reference path="../types/hap-nodejs.d.ts" />

import {Accessory, Service, Characteristic} from 'hap-nodejs';
import {HAPServer} from 'hap-nodejs/lib/HAPServer';
import {Advertiser} from 'hap-nodejs/lib/Advertiser';
import {AccessoryInfo} from 'hap-nodejs/lib/model/AccessoryInfo';
import {IdentifierCache} from 'hap-nodejs/lib/model/IdentifierCache';
import {Camera as CameraSource} from 'hap-nodejs/lib/Camera';

import Logger from '../common/logger';

export function hapStatus(err: any): number {
    let value = 0;

    for (const k in HAPServer.Status) {
        if (err.message !== k) continue;

        value = HAPServer.Status[k];
        break;
    }

    if (value === 0) value = HAPServer.Status.SERVICE_COMMUNICATION_FAILURE; // Default if not found or 0

    return value;
}

export default class Server {
    private static instances = new Set<Server>();

    readonly bridge: typeof Accessory;
    readonly config: any;
    readonly log: Logger;
    readonly accessories: typeof Accessory[];
    readonly cached_accessories: typeof Accessory[];

    readonly accessory_info: AccessoryInfo;
    readonly identifier_cache: IdentifierCache;
    readonly camera_source?: CameraSource;

    readonly server: HAPServer;
    readonly advertiser: Advertiser;
    readonly mdns: any;

    require_first_pairing?: string;
    allowed_pairings?: string[];

    /**
     * Creates a HAPServer.
     *
     * @param {HAPBridge} bridge
     * @param {object} config
     * @param {number} config.port
     * @param {boolean} config.unauthenticated_access
     * @param {Accessory[]} config.cached_accessories
     * @param {Logger} log
     * @param {AccessoryInfo} accessory_info
     * @param {IdentifierCache} identifier_cache
     * @param {Camera} camera_source
     */
    constructor(
        bridge: typeof Accessory, config: any, log: Logger,
        accessory_info: AccessoryInfo, identifier_cache: IdentifierCache, camera_source?: CameraSource
    ) {
        this.bridge = bridge;
        this.config = config;
        this.log = log;

        this.accessories = bridge.bridgedAccessories;
        this.cached_accessories = config.cached_accessories || [];

        this.accessory_info = accessory_info;
        this.identifier_cache = identifier_cache;
        this.camera_source = camera_source;

        // Create our HAP server which handles all communication between iOS devices and us
        const server = this.server = new HAPServer(this.accessory_info /* , this.relay_server */);
        server.allowInsecureRequest = config.unauthenticated_access;

        const err = (message: string, callback: Function) => (err: any) => {
            this.log.error(message, err);
            callback(err);
        };

        server.on('listening', (port: number) => this.handleServerListening(port));
        server.on('identify', (callback: any) =>
            this.handleIdentify().then(v => callback(null, v), err('Error in identify handler', callback)));
        server.on('pair', (username: string, public_key: Buffer, callback: Function) =>
            this.handlePair(username, public_key).then(v => callback(null, v), err('Error in pair handler', callback)));
        server.on('unpair', (username: string, callback: Function) =>
            this.handleUnpair(username).then(v => callback(null, v), err('Error in unpair handler', callback)));
        server.on('accessories', (callback: Function) =>
            this.handleAccessories().then(v => callback(null, v), err('Error in accessories handler', callback)));
        server.on('get-characteristics',
            (data: any, events: any, callback: Function, remote: any, connection_id: any) =>
                this.handleGetCharacteristics(data, events, remote, connection_id)
                    .then(v => callback(null, v), err('Error in get characteristics handler', callback)));
        server.on('set-characteristics',
            (data: any, events: any, callback: Function, remote: any, connection_id: any) =>
                this.handleSetCharacteristics(data, events, remote, connection_id)
                    .then(v => callback(null, v), err('Error in set characteristics handler', callback)));
        server.on('session-close', (session_id: any, events: any) => this.handleSessionClose(session_id, events));

        if (this.camera_source) {
            server.on('request-resource', (data: any, callback: Function) =>
                this.handleResource(data)
                    .then(v => callback(null, v), err('Error in request resource handler', callback)));
        }

        // Create our Advertiser which broadcasts our presence over mdns
        this.advertiser = new Advertiser(this.accessory_info, this.mdns);

        const publish = this.advertiser._bonjourService.publish;
        this.advertiser._bonjourService.publish = function(this: Advertiser, options: any) {
            options.probe = false;
            // eslint-disable-next-line prefer-rest-params
            return publish.apply(this, arguments);
        };
    }

    start() {
        if (this.started) return;

        if ([...(this.constructor as typeof Server).instances.values()]
            .find((s: Server) => s.accessory_info.username === this.accessory_info.username)
        ) {
            throw new Error('Already running another HAP server with the same ID/username');
        }

        this.log.info('Starting HAP server for %s (username %s)',
            this.bridge.displayName, this.accessory_info.username);

        (this.constructor as typeof Server).instances.add(this);
        this.server.listen(this.config.port);

        // The advertisement will be started when the server is started
    }

    get started() {
        return (this.constructor as typeof Server).instances.has(this);
    }

    stop() {
        (this.constructor as typeof Server).instances.delete(this);
        this.server.stop();
        this.stopAdvertising();
    }

    /**
     * Gets an Accessory by it's ID.
     *
     * @param {number} aid
     * @param {boolean} [include_cached]
     * @return {Accessory}
     */
    getAccessoryByID(aid: number, include_cached = false) {
        if (aid === 1) return this.bridge;

        for (const accessory of this.accessories) {
            if (this.getAccessoryID(accessory) === aid) return accessory;
        }

        if (typeof include_cached === 'undefined' || include_cached) {
            for (const accessory of this.cached_accessories) {
                if (this.getAccessoryID(accessory) === aid) return accessory;
            }
        }
    }

    /**
     * Gets a Service by it's IID.
     *
     * @param {(Accessory|number)} aid
     * @param {number} iid
     * @return {Service}
     */
    getServiceByID(aid: typeof Accessory | number, iid: number) {
        const accessory = aid instanceof Accessory ? aid : this.getAccessoryByID(aid);
        if (!accessory) return null;

        for (const service of accessory.services) {
            if (this.getServiceID(accessory, service) === iid) return service;
        }
    }

    /**
     * Gets a Characteristic by it's IID.
     *
     * @param {(Accessory|number)} aid
     * @param {number} iid
     * @return {Characteristic}
     */
    getCharacteristicByID(aid: typeof Accessory | number, iid: number): typeof Characteristic {
        const accessory = aid instanceof Accessory ? aid : this.getAccessoryByID(aid);
        if (!accessory) return null;

        for (const service of accessory.services) {
            for (const characteristic of service.characteristics) {
                if (this.getCharacteristicID(accessory, service, characteristic) === iid) return characteristic;
            }
        }
    }

    /**
     * Get/assign an accessory ID.
     *
     * @param {Accessory} accessory
     * @return {number}
     */
    getAccessoryID(accessory: typeof Accessory): number {
        if (accessory.UUID === this.bridge.UUID) return 1;

        return this.identifier_cache.getAID(accessory.UUID);
    }

    /**
     * Get/assign a service ID.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @return {number}
     */
    getServiceID(accessory: typeof Accessory, service: typeof Service): number {
        // The Accessory Information service must have a (reserved by IdentifierCache) ID of 1
        if (service.UUID === '0000003E-0000-1000-8000-0026BB765291' && !service.subtype) return 1;

        // @ts-ignore
        return (accessory._isBridge ? 2000000000 : 0) +
            this.identifier_cache.getIID(accessory.UUID, service.UUID, service.subtype);
    }

    /**
     * Get/assign a characteristic ID.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @param {Characteristic} characteristic
     * @return {number}
     */
    getCharacteristicID(
        accessory: typeof Accessory, service: typeof Service, characteristic: typeof Characteristic
    ): number {
        return this.identifier_cache.getIID(accessory.UUID, service.UUID, service.subtype, characteristic.UUID);
    }

    get listening_port(): number | null {
        const listening = this.server._httpServer._tcpServer.address();
        return listening && listening.port;
    }

    startAdvertising() {
        this.advertiser.startAdvertising(this.listening_port);
        if (this.config.hostname) this.advertiser._advertisement.host = this.config.hostname;
    }

    updateAdvertisement() {
        this.advertiser.updateAdvertisement();
    }

    stopAdvertising() {
        this.advertiser.stopAdvertising();
    }

    get is_advertising() {
        return this.advertiser.isAdvertising();
    }

    /**
     * Called when the server starts listening.
     *
     * @param {number} port
     */
    handleServerListening(port: number) {
        this.startAdvertising();
    }

    /**
     * Unsubscribes all events for an accessory.
     *
     * @param {Accessory} accessory
     */
    unsubscribeAllEventsForAccessory(accessory: typeof Accessory) {
        const aid = this.getAccessoryID(accessory);

        for (const connection of this.server._httpServer._connections) {
            for (const k of Object.keys(connection._events)) {
                const match = k.match(/^([0-9]*)\.([0-9]*)$/);
                if (!match || aid != (match[1] as unknown as number)) continue;

                const characteristic = this.getCharacteristicByID(accessory, parseInt(match[2]));
                if (characteristic) characteristic.unsubscribe();

                delete connection._events[k];
            }
        }
    }

    /**
     * Handle /identify requests.
     * This is only used when the accessory/bridge isn't paired.
     *
     * @return {Promise}
     */
    async handleIdentify() {
        return new Promise((rs, rj) => {
            // @ts-ignore
            this.bridge._handleIdentify((err: any) => err ? rj(err) : rs());
        });
    }

    /**
     * Handle /pair requests.
     *
     * @param {string} username
     * @param {string} public_key
     * @return {Promise}
     */
    async handlePair(username: string, public_key: Buffer) {
        const require_first_pairing = this.require_first_pairing;
        if (!Object.keys(this.accessory_info.pairedClients).length && require_first_pairing &&
            require_first_pairing !== username) {
            throw new Error('Client is not allowed to pair with this accessory');
        }

        const allowed_pairings = this.allowed_pairings;
        if (allowed_pairings && !allowed_pairings.includes(username)) {
            throw new Error('Client is not allowed to pair with this accessory');
        }

        this.log.info('Pairing with client %s', username);

        this.accessory_info.addPairedClient(username, public_key);
        this.accessory_info.save();

        // Update our advertisement so it can pick up on the paired status of AccessoryInfo
        this.updateAdvertisement();

        // @ts-ignore
        this.bridge.emit('hap-server-update-pairings');
    }

    /**
     * Handle /unpair requests.
     *
     * @param {string} username
     * @return {Promise}
     */
    async handleUnpair(username: string) {
        this.log.info('Unpairing with client %s', username);

        this.accessory_info.removePairedClient(username);
        this.accessory_info.save();

        // Update our advertisement so it can pick up on the paired status of AccessoryInfo
        this.updateAdvertisement();

        // @ts-ignore
        this.bridge.emit('hap-server-update-pairings');
    }

    /**
     * Handle /accessories requests.
     * Called when an iOS client wishes to know all about our accessory via JSON payload.
     */
    async handleAccessories() {
        this.log.debug('Getting accessories');

        // Build out our JSON payload and call the callback
        const hap = this.toHAP();

        // Save the identifier cache in case new identifiers were assigned
        this.identifier_cache.save();

        return hap;
    }

    /**
     * Get a HAP JSON representation of all accessories.
     *
     * @param {object} [options]
     * @return {object}
     */
    toHAP(options?: any) {
        return {
            // Array of Accessory HAP
            // _handleGetCharacteristics will return SERVICE_COMMUNICATION_FAILURE for cached characteristics
            accessories: [this.bridge].concat(this.accessories)
                .map(accessory => this.accessoryToHAP(accessory, options))
                .concat(this.cached_accessories
                    .map(accessory => this.accessoryToHAP(accessory, options, true))),
        };
    }

    /**
     * Get a HAP JSON representation of an Accessory.
     *
     * @param {Accessory} accessory
     * @param {object} [options]
     * @param {boolean} [is_cached]
     * @return {object}
     */
    accessoryToHAP(accessory: typeof Accessory, options?: any, is_cached = false) {
        return {
            aid: this.getAccessoryID(accessory),
            services: accessory.services.map(service => ({
                iid: this.getServiceID(accessory, service),
                type: service.UUID,
                characteristics: service.characteristics
                    .map(characteristic => Object.assign(characteristic.toHAP(options), {
                        iid: this.getCharacteristicID(accessory, service, characteristic),
                    }, is_cached ? {
                        status: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
                    } : {})),

                // @ts-ignore
                primary: service.isPrimaryService,
                // @ts-ignore
                hidden: service.isHiddenService,

                // @ts-ignore
                linked: service.linkedServices.map(linked_service => this.getServiceID(accessory, linked_service)),
            })),
        };
    }

    /**
     * Handle /characteristics requests.
     * Called when an iOS client wishes to query the state of one or more characteristics, like "door open?", "light on?", etc.
     *
     * @param {object[]} data
     * @param {object} events
     * @param {object} remote
     * @param {string} connection_id
     * @return {Promise<object[]>}
     */
    async handleGetCharacteristics(data: any, events: object, remote: boolean, connection_id: string) {
        return Promise.all(data.map((data: any) => this.handleGetCharacteristic(data, events, remote, connection_id)));
    }

    async handleGetCharacteristic(data: any, events: any, remote: boolean, connection_id: string) {
        const status_key = remote ? 's' : 'status';
        const value_key = remote ? 'v' : 'value';

        const {aid, iid, e: include_event} = data;
        const accessory = this.getAccessoryByID(aid, false);

        if (!accessory) {
            this.log.debug('Tried to get a characteristic from an unknown/cached accessory with aid', aid,
                'and iid', iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        const characteristic = this.getCharacteristicByID(accessory, iid);

        if (!characteristic) {
            this.log.warn('Could not find a characteristic with aid', aid, 'and iid', iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        // Found the Characteristic! Get the value!
        this.log.debug('Getting value for characteristic "%s"', characteristic.displayName);

        // We want to remember "who" made this request, so that we don't send them an event notification
        // about any changes that occurred as a result of the request. For instance, if after querying
        // the current value of a characteristic, the value turns out to be different than the previously
        // cached Characteristic value, an internal 'change' event will be emitted which will cause us to
        // notify all connected clients about that new value. But this client is about to get the new value
        // anyway, so we don't want to notify it twice.
        const context = events;

        try {
            const value = await new Promise((rs, rj) => characteristic.getValue((err: any, value: any) => {
                err ? rj(err) : rs(value);
            }, context, connection_id));

            // set the value and wait for success
            this.log.debug('Got characteristic "%s"', characteristic.displayName, value);

            // Compose the response and add it to the list
            return {
                aid, iid,
                [value_key]: value,
                [status_key]: 0,
                e: include_event ? events[`${aid}.${iid}`] === true : undefined,
            };
        } catch (err) {
            this.log.debug('Error getting value for characteristic "%s"', characteristic.displayName, err);

            return {
                aid, iid,
                [status_key]: hapStatus(err),
            };
        }
    }

    /**
     * Handle /characteristics requests.
     * Called when an iOS client wishes to change the state of this accessory - like opening a door, or turning on a light.
     * Or, to subscribe to change events for a particular Characteristic.
     *
     * @param {object[]} data
     * @param {object} events
     * @param {object} remote
     * @param {string} connection_id
     * @return {Promise<object[]>}
     */
    async handleSetCharacteristics(data: any, events: object, remote: boolean, connection_id: string) {
        // data is an array of characteristics and values like this:
        // [ { aid: 1, iid: 8, value: true, ev: true } ]

        this.log.debug('Processing characteristic set', JSON.stringify(data));

        return Promise.all(data.map((data: any) => this.handleSetCharacteristic(data, events, remote, connection_id)));
    }

    async handleSetCharacteristic(data: any, events: any, remote: boolean, connection_id: string) {
        const value = remote ? data.v : data.value;
        const ev = remote ? data.e : data.ev;
        const include_value = data.r || false;

        const status_key = remote ? 's' : 'status';

        const {aid, iid} = data;
        const accessory = this.getAccessoryByID(aid, false);

        if (!accessory) {
            this.log.debug('Tried to get a characteristic from an unknown/cached accessory with aid', aid,
                'and iid', iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        const characteristic = this.getCharacteristicByID(accessory, iid);

        if (!characteristic) {
            this.log.warn('Could not find a characteristic with aid %d and iid %d', aid, iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        // We want to remember "who" initiated this change, so that we don't send them an event notification
        // about the change they just made. We do this by leveraging the arbitrary "context" object supported
        // by Characteristic and passed on to the corresponding 'change' events bubbled up from Characteristic
        // through Service and Accessory. We'll assign it to the events object since it essentially represents
        // the connection requesting the change.
        const context = events;

        // if "ev" is present, that means we need to register or unregister this client for change events for
        // this characteristic.
        if (typeof ev !== 'undefined') {
            this.log.debug(`${ev ? 'R' : 'Unr'}egistering characteristic "%s"`, characteristic.displayName);

            // Store event registrations in the supplied "events" dict which is associated with the connection making
            // the request.
            const event_name = aid + '.' + iid;

            if (ev === true && events[event_name] !== true) {
                events[event_name] = true; // value is arbitrary, just needs to be non-falsey
                characteristic.subscribe();
            }

            if (ev === false && events[event_name] !== undefined) {
                characteristic.unsubscribe();
                delete events[event_name]; // unsubscribe by deleting name from dict
            }
        }

        // Found the characteristic - set the value if there is one
        if (typeof value !== 'undefined') {
            this.log.debug('Setting characteristic "%s"', characteristic.displayName, value);

            try {
                // Set the value and wait for success
                await new Promise((rs, rj) => characteristic.setValue(value, (err: any, value: any) => {
                    err ? rj(err) : rs(value);
                }, context, connection_id));

                return {
                    aid, iid,
                    [status_key]: 0,
                    value: include_value ? characteristic.value : undefined,
                };
            } catch (err) {
                this.log.debug('Error setting characteristic "%s"', characteristic.displayName, value, err.message);

                return {
                    aid, iid,
                    [status_key]: hapStatus(err),
                };
            }
        }

        // no value to set, so we're done (success)
        return {
            aid, iid,
            [status_key]: 0,
        };
    }

    /**
     * Handles resource requests.
     *
     * @param {object} data
     * @return {Promise}
     */
    async handleResource(data: any) {
        if (data['resource-type'] === 'image' && this.camera_source) {
            return await new Promise((rs, rj) => this.camera_source.handleSnapshotRequest({
                width: data['image-width'],
                height: data['image-height'],
            }, (err: any, data: any) => err ? rj(err) : rs(data)));
        }

        throw new Error('resource not found');
    }

    /**
     * Handles session close.
     *
     * @param {string} session_id
     * @param {object} events
     * @return {Promise}
     */
    async handleSessionClose(session_id: string, events: object) {
        if (this.camera_source && this.camera_source.handleCloseConnection) {
            this.camera_source.handleCloseConnection(session_id);
        }

        // this._unsubscribeEvents(events);

        for (const key in events) {
            if (key.indexOf('.') === -1) continue;

            try {
                const [aid, iid] = key.split('.');

                const characteristic = this.getCharacteristicByID(parseInt(aid), parseInt(iid));
                if (characteristic) characteristic.unsubscribe();
            } catch (err) {}
        }
    }
}
