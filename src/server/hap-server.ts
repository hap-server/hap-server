import * as net from 'net';

import {Accessory, Service, Characteristic, CameraController, CharacteristicValue} from 'hap-nodejs';
import {Access, Perms} from 'hap-nodejs/dist/lib/Characteristic';
import {
    HAPHTTPCode, HAPServer, HAPServerEventTypes, HAPStatus, HAPStatus as _Status, TLVErrorCode,
} from 'hap-nodejs/dist/lib/HAPServer';
import {EventedHTTPServer, HAPConnection} from 'hap-nodejs/dist/lib/util/eventedhttp';
import {Advertiser} from 'hap-nodejs/dist/lib/Advertiser';
import {AccessoryInfo, PermissionTypes} from 'hap-nodejs/dist/lib/model/AccessoryInfo';
import {IdentifierCache} from 'hap-nodejs/dist/lib/model/IdentifierCache';
import {
    CharacteristicsReadRequest,
    CharacteristicId,
    CharacteristicReadData,
    CharacteristicsReadResponse,
    CharacteristicsWriteRequest,
    CharacteristicWrite,
    CharacteristicWriteData,
    CharacteristicsWriteResponse,
    ResourceRequest,
    ResourceRequestType,
} from 'hap-nodejs/dist/internal-types';
import {CiaoService} from '@homebridge/ciao';

import Logger from '../common/logger';
import {PluginAccessory} from './accessories';
import {AccessoryStatus} from '../common/types/accessories';
import {toShortForm} from '../util/uuid';

const READ_TIMEOUT_WARNING_THRESHOLD = 2000;
const READ_TIMEOUT_WARNING_DISPLAY_THRESHOLD = '2 seconds';
const READ_TIMEOUT_ERROR_THRESHOLD = 5000;
const READ_TIMEOUT_ERROR_DISPLAY_THRESHOLD = '5 seconds';
const WRITE_TIMEOUT_WARNING_THRESHOLD = 5000;
const WRITE_TIMEOUT_WARNING_DISPLAY_THRESHOLD = '5 seconds';
const WRITE_TIMEOUT_ERROR_THRESHOLD = 10000;
const WRITE_TIMEOUT_ERROR_DISPLAY_THRESHOLD = '10 seconds';

const Status: Record<string, HAPStatus> = {
    SUCCESS: 0,
    INSUFFICIENT_PRIVILEGES: -70401,
    SERVICE_COMMUNICATION_FAILURE: -70402,
    RESOURCE_BUSY: -70403,
    READ_ONLY_CHARACTERISTIC: -70404,
    WRITE_ONLY_CHARACTERISTIC: -70405,
    NOTIFICATION_NOT_SUPPORTED: -70406,
    OUT_OF_RESOURCE: -70407,
    OPERATION_TIMED_OUT: -70408,
    RESOURCE_DOES_NOT_EXIST: -70409,
    INVALID_VALUE_IN_REQUEST: -70410,
    INSUFFICIENT_AUTHORIZATION: -70411,
};

export function hapStatus(err: any): HAPStatus {
    let value = 0;

    for (const k in Status) {
        if (err.message !== k) continue;

        value = Status[k];
        break;
    }

    if (value === 0) value = Status.SERVICE_COMMUNICATION_FAILURE; // Default if not found or 0

    return value;
}

export default class Server {
    private static instances = new Set<Server>();

    readonly bridge: Accessory;
    readonly config: any;
    readonly log: Logger;
    readonly accessories: Accessory[];
    readonly cached_accessories: Accessory[];

    readonly accessory_info: AccessoryInfo;
    readonly identifier_cache: IdentifierCache;

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
     */
    constructor(
        bridge: Accessory, config: any, log: Logger,
        accessory_info: AccessoryInfo, identifier_cache: IdentifierCache
    ) {
        this.bridge = bridge;
        this.config = config;
        this.log = log;

        this.accessories = bridge.bridgedAccessories;
        this.cached_accessories = config.cached_accessories || [];

        this.accessory_info = accessory_info;
        this.identifier_cache = identifier_cache;

        // Create our HAP server which handles all communication between iOS devices and us
        const server = this.server = new HAPServer(this.accessory_info /* , this.relay_server */);
        server.allowInsecureRequest = config.unauthenticated_access;

        const err = (message: string, callback: Function) => (err: any) => {
            this.log.error(message, err);
            callback(err);
        };

        server.on(HAPServerEventTypes.LISTENING, (port, address) => this.handleServerListening(port, address));
        server.on(HAPServerEventTypes.IDENTIFY, callback =>
            this.handleIdentify().then(v => callback(null), err('Error in identify handler', callback)));
        server.on(HAPServerEventTypes.PAIR, (username, client_ltpk, callback) => this.handlePair(username, client_ltpk)
            .then(v => callback(null), err('Error in pair handler', callback)));
        server.on(HAPServerEventTypes.ADD_PAIRING, (connection, username, public_key, permissions, callback) =>
            this.handleAddPairing(connection, username, public_key, permissions)
                .then(v => callback(0, v), err('Error in add pairing handler', callback)));
        server.on(HAPServerEventTypes.REMOVE_PAIRING, (connection, username, callback) =>
            this.handleRemovePairing(connection, username)
                .then(v => callback(0, v), err('Error in remove pairing handler', callback)));
        server.on(HAPServerEventTypes.LIST_PAIRINGS, (connection, callback) => this.handleListPairings(connection)
            .then(v => callback(0, v), err('Error in list pairings handler', callback)));
        server.on(HAPServerEventTypes.ACCESSORIES, (connection, callback) => this.handleAccessories(connection)
            .then(v => callback(undefined, v), err('Error in accessories handler', callback)));
        server.on(HAPServerEventTypes.GET_CHARACTERISTICS, (connection, request, callback) =>
            this.handleReadCharacteristics(connection, request)
                .then(v => callback(undefined, v), err('Error in get characteristics handler', callback)));
        server.on(HAPServerEventTypes.SET_CHARACTERISTICS, (connection, request, callback) =>
            this.handleWriteCharacteristics(connection, request)
                .then(v => callback(undefined, v), err('Error in set characteristics handler', callback)));
        server.on(HAPServerEventTypes.REQUEST_RESOURCE, (data, callback) => this.handleResource(data)
            .then(v => callback(undefined, v), err('Error in request resource handler', callback)));
        server.on(HAPServerEventTypes.CONNECTION_CLOSED, connection => this.handleSessionClose(connection));

        // Create our Advertiser which broadcasts our presence over mdns
        this.advertiser = new Advertiser(this.accessory_info, this.mdns);
    }

    get http_server(): EventedHTTPServer {
        // @ts-expect-error
        return this.server.httpServer;
    }

    get connections(): Set<HAPConnection> {
        // @ts-expect-error
        return this.http_server.connections;
    }

    get tcp_server(): net.Server {
        // @ts-expect-error
        return this.http_server.tcpServer;
    }

    get ciao_service(): CiaoService {
        // @ts-expect-error
        return this.advertiser.advertisedService;
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
    getServiceByID(aid: Accessory | number, iid: number) {
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
    getCharacteristicByID(aid: Accessory | number, iid: number): Characteristic | null {
        const accessory = aid instanceof Accessory ? aid : this.getAccessoryByID(aid);
        if (!accessory) return null;

        for (const service of accessory.services) {
            for (const characteristic of service.characteristics) {
                if (this.getCharacteristicID(accessory, service, characteristic) === iid) return characteristic;
            }
        }

        return null;
    }

    /**
     * Get/assign an accessory ID.
     *
     * @param {Accessory} accessory
     * @return {number}
     */
    getAccessoryID(accessory: Accessory): number {
        if (accessory.UUID === this.bridge.UUID) return 1;

        // Make sure an accessory ID is assigned to pass assertions in Accessory.toHAP
        if (typeof accessory.aid !== 'number') accessory.aid = 1;

        return this.identifier_cache.getAID(accessory.UUID);
    }

    /**
     * Get/assign a service ID.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @return {number}
     */
    getServiceID(accessory: Accessory, service: Service): number {
        // The Accessory Information service must have a (reserved by IdentifierCache) ID of 1
        if (service.UUID === '0000003E-0000-1000-8000-0026BB765291' && !service.subtype) return 1;

        // Make sure a service ID is assigned to pass assertions in Service.toHAP
        if (typeof service.iid !== 'number') service.iid = 1;

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
        accessory: Accessory, service: Service, characteristic: Characteristic
    ): number {
        // Make sure a characteristic ID is assigned to pass assertions in Characteristic.toHAP
        if (typeof characteristic.iid !== 'number') characteristic.iid = 1;

        return this.identifier_cache.getIID(accessory.UUID, service.UUID, service.subtype, characteristic.UUID);
    }

    get listening_port(): number | null {
        const listening = this.tcp_server.address() as net.AddressInfo | null;
        return listening && listening.port;
    }

    startAdvertising() {
        if (!this.listening_port) throw new Error('Not listening');

        if (this.config.hostname) {
            // @ts-expect-error
            this.ciao_service.hostname = this.config.hostname;
        }

        this.advertiser.initPort(this.listening_port);
        this.advertiser.startAdvertising();
    }

    updateAdvertisement() {
        this.advertiser.updateAdvertisement();
    }

    stopAdvertising() {
        // @ts-expect-error
        this.advertiser.advertisedService.end();
    }

    get is_advertising() {
        // @ts-expect-error
        return this.advertiser.advertisedService.serviceState !== 'unannounced';
    }

    /**
     * Called when the server starts listening.
     *
     * @param {number} port
     * @param {string} address
     */
    handleServerListening(port: number, address: string) {
        this.startAdvertising();
    }

    /**
     * Unsubscribes all events for an accessory.
     *
     * @param {Accessory} accessory
     */
    unsubscribeAllEventsForAccessory(accessory: Accessory) {
        const aid = this.getAccessoryID(accessory);

        for (const connection of this.connections) {
            for (const key of connection.getRegisteredEvents()) {
                if (key.indexOf('.') === -1) continue;

                try {
                    const [aid, iid] = key.split('.').map(n => parseInt(n));
                    if (aid !== aid) continue;

                    const characteristic = this.getCharacteristicByID(aid, iid);
                    if (characteristic) characteristic.unsubscribe();

                    connection.disableEventNotifications(aid, iid);
                } catch (err) {}
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
     * Handle /pair-setup requests.
     *
     * @param {string} pairing_id
     * @param {string} public_key
     * @return {Promise}
     */
    async handlePair(pairing_id: string, public_key: Buffer) {
        const require_first_pairing = this.require_first_pairing;
        if (!Object.keys(this.accessory_info.pairedClients).length && require_first_pairing &&
            require_first_pairing !== pairing_id) {
            throw new Error('Client is not allowed to pair with this accessory');
        }

        const allowed_pairings = this.allowed_pairings;
        if (allowed_pairings && !allowed_pairings.includes(pairing_id)) {
            throw new Error('Client is not allowed to pair with this accessory');
        }

        this.log.info('Pairing with client %s', pairing_id);

        this.accessory_info.addPairedClient(pairing_id, public_key, PermissionTypes.ADMIN);
        this.accessory_info.save();

        // Update our advertisement so it can pick up on the paired status of AccessoryInfo
        this.updateAdvertisement();

        // @ts-ignore
        this.bridge.emit('hap-server-update-pairings');
    }

    /**
     * Handle /pairings add requests.
     *
     * @param {HAPConnection} connection
     * @param {string} pairing_id
     * @param {Buffer} public_key
     * @param {number} permissions
     * @return {Promise}
     */
    async handleAddPairing(
        connection: HAPConnection, pairing_id: string, public_key: Buffer, permissions: PermissionTypes
    ) {
        if (!this.accessory_info.hasAdminPermissions(connection.username!)) {
            this.log.warn('Non-admin client with pairing ID %s attempted to add a pairing',
                connection.username, {pairing_id, public_key, permissions});
            throw TLVErrorCode.AUTHENTICATION;
        }

        const allowed_pairings = this.allowed_pairings;
        if (allowed_pairings && !allowed_pairings.includes(pairing_id)) {
            // throw new Error('Client is not allowed to pair with this accessory');
            throw TLVErrorCode.UNKNOWN;
        }

        this.log.info('Pairing with client %s', pairing_id);

        this.accessory_info.addPairedClient(pairing_id, public_key, permissions);
        this.accessory_info.save();

        // @ts-ignore
        this.bridge.emit('hap-server-update-pairings');
    }

    /**
     * Handle /pairings remove requests.
     *
     * @param {HAPConnection} connection
     * @param {string} pairing_id
     * @return {Promise}
     */
    async handleRemovePairing(connection: HAPConnection, pairing_id: string) {
        if (!this.accessory_info.hasAdminPermissions(connection.username!)) {
            this.log.warn('Non-admin client with pairing ID %s attempted to remove pairing %s',
                connection.username, pairing_id);
            throw TLVErrorCode.AUTHENTICATION;
        }

        this.log.info('Unpairing with client %s', pairing_id);

        this.accessory_info.removePairedClient(connection, pairing_id);
        this.accessory_info.save();

        // @ts-ignore
        this.bridge.emit('hap-server-update-pairings');

        if (!this.accessory_info.paired()) {
            // Update our advertisement so it can pick up on the paired status of AccessoryInfo
            this.updateAdvertisement();

            // this.bridge.handleAccessoryUnpairedForControllers();
            // for (const accessory of this.accessories) {
            //     accessory.handleAccessoryUnpairedForControllers();
            // }
        }
    }

    /**
     * Handle /pairings list requests.
     *
     * @param {HAPConnection} connection
     * @return {Promise}
     */
    async handleListPairings(connection: HAPConnection) {
        if (!this.accessory_info.hasAdminPermissions(connection.username!)) {
            this.log.warn('Non-admin client with pairing ID %s attempted to list pairings', connection.username);
            throw TLVErrorCode.AUTHENTICATION;
        }

        this.log.info('Listing pairings');

        return this.accessory_info.listPairings();
    }

    /**
     * Handle /accessories requests.
     * Called when an iOS client wishes to know all about our accessory via JSON payload.
     *
     * @param {HAPConnection} connection
     */
    async handleAccessories(connection: HAPConnection) {
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
    toHAP() {
        return {
            // Array of Accessory HAP
            // _handleGetCharacteristics will return SERVICE_COMMUNICATION_FAILURE for cached characteristics
            accessories: [this.bridge].concat(this.accessories)
                .map(accessory => this.accessoryToHAP(accessory,
                    accessory[PluginAccessory.symbol]?.status !== AccessoryStatus.READY))
                .concat(this.cached_accessories
                    .map(accessory => this.accessoryToHAP(accessory, true))),
        };
    }

    /**
     * Get a HAP JSON representation of an Accessory.
     *
     * @param {Accessory} accessory
     * @param {boolean} [is_unavailable]
     * @return {object}
     */
    accessoryToHAP(accessory: Accessory, is_unavailable = false) {
        return {
            aid: this.getAccessoryID(accessory),

            services: accessory.services.map(service => ({
                iid: this.getServiceID(accessory, service),
                type: service.UUID,

                characteristics: service.characteristics.map(characteristic => {
                    return {
                        ...characteristic.internalHAPRepresentation(),
                        iid: this.getCharacteristicID(accessory, service, characteristic),
                        ...(is_unavailable ? {
                            status: HAPStatus.SERVICE_COMMUNICATION_FAILURE,
                        } : {
                            value: characteristic.value,
                        }),
                    };
                }),

                primary: service.isPrimaryService,
                hidden: service.isHiddenService,

                linked: service.linkedServices.map(linked_service => this.getServiceID(accessory, linked_service)),
            })),
        };
    }

    /**
     * Handle GET /characteristics requests.
     * Called when an iOS client wishes to query the state of one or more characteristics, like "door open?", "light on?", etc.
     *
     * @param {HAPConnection} connection
     * @param {CharacteristicsReadRequest} request
     * @return {Promise<CharacteristicsReadResponse>}
     */
    async handleReadCharacteristics(
        connection: HAPConnection, request: CharacteristicsReadRequest
    ): Promise<CharacteristicsReadResponse> {
        return {
            characteristics: await Promise.all(request.ids.map(ids =>
                this.handleReadCharacteristic(connection, request, ids))),
        };
    }

    async handleReadCharacteristic(
        connection: HAPConnection, request: CharacteristicsReadRequest, {aid, iid}: CharacteristicId
    ): Promise<CharacteristicReadData> {
        const accessory = this.getAccessoryByID(aid, false);

        if (!accessory || accessory[PluginAccessory.symbol]?.status !== AccessoryStatus.READY) {
            this.log.debug('Tried to get a characteristic from an unknown/cached accessory with aid %d and iid %d',
                aid, iid);

            return {aid, iid, status: HAPStatus.SERVICE_COMMUNICATION_FAILURE};
        }

        const characteristic = this.getCharacteristicByID(accessory, iid);

        if (!characteristic) {
            this.log.warn('Could not find a characteristic with aid %d and iid %d', aid, iid);

            return {aid, iid, status: HAPStatus.SERVICE_COMMUNICATION_FAILURE};
        }

        if (!characteristic.props.perms.includes(Perms.PAIRED_READ)) {
            this.log.warn('Tried to read a characteristic which doesn\'t support reading with aid %d and iid %d',
                aid, iid);
            return {aid, iid, status: HAPStatus.WRITE_ONLY_CHARACTERISTIC};
        }

        if (characteristic.props.adminOnlyAccess && characteristic.props.adminOnlyAccess.includes(Access.READ)) {
            if (!connection.username) {
                this.log.warn('Unable to verify client reading an admin-only characteristic is an admin ' +
                    'with aid %d and iid %d, denying access to be safe', aid, iid);
                return {aid, iid, status: HAPStatus.INSUFFICIENT_PRIVILEGES};
            } else if (!this.accessory_info.hasAdminPermissions(connection.username)) {
                this.log.warn('Non-admin user attempted to read an admin-only characteristic with aid %d and iid %d',
                    aid, iid);
                return {aid, iid, status: HAPStatus.INSUFFICIENT_PRIVILEGES};
            }
        }

        // Found the Characteristic! Get the value!
        this.log.debug('Getting value for characteristic "%s"', characteristic.displayName);

        try {
            const value = await this.readCharacteristicWithTimeout(accessory, characteristic, connection);

            this.log.debug('Got characteristic "%s"', characteristic.displayName, value);

            return {
                aid, iid, value: value ?? null,

                ...(request.includeMeta ? {
                    format: characteristic.props.format,
                    unit: characteristic.props.unit,
                    minValue: characteristic.props.minValue,
                    maxValue: characteristic.props.maxValue,
                    minStep: characteristic.props.minStep,
                    maxLen: characteristic.props.maxLen ?? characteristic.props.maxDataLen,
                } : null),

                ...(request.includePerms ? {
                    perms: characteristic.props.perms,
                } : null),

                ...(request.includeType ? {
                    type: toShortForm(characteristic.UUID),
                } : null),

                ...(request.includeEvent ? {
                    ev: connection.hasEventNotifications(aid, iid),
                }: null),
            };
        } catch (err) {
            this.log.debug('Error getting value for characteristic "%s"', characteristic.displayName, err);

            return {aid, iid, status: hapStatus(err)};
        }
    }

    /**
     * Handle POST /characteristics requests.
     * Called when an iOS client wishes to change the state of this accessory - like opening a door, or turning
     * on a light. Or, to subscribe to change events for a particular Characteristic.
     *
     * @param {HAPConnection} connection
     * @param {CharacteristicsWriteRequest} request
     * @return {Promise<CharacteristicsWriteResponse>}
     */
    async handleWriteCharacteristics(
        connection: HAPConnection, request: CharacteristicsWriteRequest
    ): Promise<CharacteristicsWriteResponse> {
        this.log.debug('Processing characteristic write', JSON.stringify(request));

        if ('pid' in request) {
            if (connection.timedWritePid === request.pid) {
                clearTimeout(connection.timedWriteTimeout!);
                connection.timedWritePid = undefined;
                connection.timedWriteTimeout = undefined;

                this.log.debug('Acknowledged timed write request with pid %d', request.pid);
            } else {
                return {
                    characteristics: request.characteristics.map(req => {
                        return {
                            aid: req.aid, iid: req.iid,
                            status: HAPStatus.INVALID_VALUE_IN_REQUEST,
                        };
                    }),
                };
            }
        }

        return {
            characteristics: await Promise.all(request.characteristics.map(req =>
                this.handleWriteCharacteristic(connection, request, req, 'pid' in request))),
        };
    }

    async handleWriteCharacteristic(
        connection: HAPConnection, request: CharacteristicsWriteRequest, req: CharacteristicWrite, timed_write = false
    ): Promise<CharacteristicWriteData> {
        const {aid, iid} = req;
        const accessory = this.getAccessoryByID(aid, false);

        if (!accessory || accessory[PluginAccessory.symbol]?.status !== AccessoryStatus.READY) {
            this.log.debug('Tried to get a characteristic from an unknown/cached accessory with aid %d and iid %d',
                aid, iid);
            return {aid, iid, status: HAPStatus.SERVICE_COMMUNICATION_FAILURE};
        }

        const characteristic = this.getCharacteristicByID(accessory, iid);

        if (!characteristic) {
            this.log.warn('Could not find a characteristic with aid %d and iid %d', aid, iid);
            return {aid, iid, status: HAPStatus.SERVICE_COMMUNICATION_FAILURE};
        }

        if ('ev' in req) {
            // Validate event subscription request

            if (!characteristic.props.perms.includes(Perms.NOTIFY)) {
                this.log.warn('Tried to subscribe to events for a characteristic which doesn\'t support events ' +
                    'with aid %d and iid %d', aid, iid);
                return {aid, iid, status: HAPStatus.NOTIFICATION_NOT_SUPPORTED};
            }

            if (characteristic.props.adminOnlyAccess && characteristic.props.adminOnlyAccess.includes(Access.NOTIFY)) {
                if (!connection.username) {
                    this.log.warn('Unable to verify client subscribing to events for an admin-only characteristic ' +
                        'is an admin with aid %d and iid %d, denying access to be safe', aid, iid);
                    return {aid, iid, status: HAPStatus.INSUFFICIENT_PRIVILEGES};
                } else if (!this.accessory_info.hasAdminPermissions(connection.username)) {
                    this.log.warn('Non-admin user attempted to subscribe to events for an admin-only characteristic ' +
                        'with aid %d and iid %d', aid, iid);
                    return {aid, iid, status: HAPStatus.INSUFFICIENT_PRIVILEGES};
                }
            }
        }

        if ('value' in req) {
            // Validate write request

            if (!characteristic.props.perms.includes(Perms.PAIRED_WRITE)) {
                this.log.warn('Tried to write to a characteristic which doesn\'t support writes with aid %d and iid %d',
                    aid, iid);
                return {aid, iid, status: HAPStatus.READ_ONLY_CHARACTERISTIC};
            }

            if (characteristic.props.adminOnlyAccess && characteristic.props.adminOnlyAccess.includes(Access.WRITE)) {
                if (!connection.username) {
                    this.log.warn('Unable to verify client writing to an admin-only characteristic ' +
                        'is an admin with aid %d and iid %d, denying access to be safe', aid, iid);
                    return {aid, iid, status: HAPStatus.INSUFFICIENT_PRIVILEGES};
                } else if (!this.accessory_info.hasAdminPermissions(connection.username)) {
                    this.log.warn('Non-admin user attempted to write to an admin-only characteristic ' +
                        'with aid %d and iid %d', aid, iid);
                    return {aid, iid, status: HAPStatus.INSUFFICIENT_PRIVILEGES};
                }
            }

            if (
                characteristic.props.perms.includes(Perms.ADDITIONAL_AUTHORIZATION) &&
                characteristic.additionalAuthorizationHandler
            ) {
                // if the characteristic "supports additional authorization" but doesn't define a handler for the check
                // we conclude that the characteristic doesn't want to check the authData (currently) and just allows
                // access for everybody

                try {
                    if (!characteristic.additionalAuthorizationHandler(req.authData)) {
                        return {aid, iid, status: HAPStatus.INSUFFICIENT_AUTHORIZATION};
                    }
                } catch (err) {
                    this.log.error('Error thrown while checking additional authorisation for characteristic ' +
                        'with aid %d and iid %d', aid, iid, err);
                    return {aid, iid, status: HAPStatus.INSUFFICIENT_AUTHORIZATION};
                }
            }

            if (characteristic.props.perms.includes(Perms.TIMED_WRITE) && !timed_write) {
                this.log.warn('Tried to write to a characteristic which requires timed writes without using a timed ' +
                    'write with aid %d and iid %d', aid, iid);
                return {aid, iid, status: HAPStatus.INVALID_VALUE_IN_REQUEST};
            }
        }

        /** Write response */
        let value: CharacteristicValue | null | undefined = undefined;

        if ('value' in req) {
            try {
                this.log.debug('Setting characteristic "%s"', characteristic.displayName, req.value);

                const res = await this.writeCharacteristicWithTimeout(
                    accessory, characteristic, connection, req.value!
                );

                // @ts-expect-error
                if (req.r) value = res ?? null;
            } catch (err) {
                this.log.debug('Error setting value for characteristic "%s"', characteristic.displayName, err);

                return {aid, iid, status: hapStatus(err)};
            }
        }

        /** Event subscription response */
        let ev: boolean | undefined = undefined;

        if ('ev' in req) {
            // Subscribe to events *after handling the write request* as HAP can't respond with an error writing to the
            // characteristic and successfully subscribe to/unsubscribe from events

            if (req.ev && !connection.hasEventNotifications(req.aid, req.iid)) {
                connection.enableEventNotifications(req.aid, req.iid);
                characteristic.subscribe();
                ev = true;
            } else if (!req.ev && connection.hasEventNotifications(req.aid, req.iid)) {
                characteristic.unsubscribe();
                connection.disableEventNotifications(req.aid, req.iid);
                ev = false;
            } else {
                this.log.debug('Client attempted to subscribe/unsubscribe for events, but they are already ' +
                    'subscribed/not subscribed');
            }
        }

        return {
            aid, iid,
            value,
            ev,
        };
    }

    async readCharacteristicWithTimeout(
        accessory: Accessory, characteristic: Characteristic, connection: HAPConnection
    ): Promise<CharacteristicValue | null> {
        const warning_timeout = setTimeout(() => {
            this.log.warn('Characteristic "%s" of accessory "%s" took more than %s to respond',
                characteristic.displayName, accessory.displayName, READ_TIMEOUT_WARNING_DISPLAY_THRESHOLD);
        }, READ_TIMEOUT_WARNING_THRESHOLD);

        let error_timeout;
        let error_rs: Function;

        try {
            return await Promise.race([
                new Promise<null>((rs, rj) => {
                    error_rs = rs;
                    error_timeout = setTimeout(() => {
                        rj(new Error('Characteristic "' + characteristic.displayName + '" of accessory "' +
                            accessory.displayName + '" took more than ' + READ_TIMEOUT_ERROR_DISPLAY_THRESHOLD +
                            ' to respond'));
                    }, READ_TIMEOUT_ERROR_THRESHOLD);
                }),
                characteristic.handleGetRequest(connection),
            ]);
        } finally {
            clearTimeout(warning_timeout);
            clearTimeout(error_timeout);
            error_rs!(null);
        }
    }

    async writeCharacteristicWithTimeout(
        accessory: Accessory, characteristic: Characteristic, connection: HAPConnection, value: CharacteristicValue
    ): Promise<CharacteristicValue | void> {
        const warning_timeout = setTimeout(() => {
            this.log.warn('Characteristic "%s" of accessory "%s" took more than %s to respond',
                characteristic.displayName, accessory.displayName, WRITE_TIMEOUT_WARNING_DISPLAY_THRESHOLD);
        }, WRITE_TIMEOUT_WARNING_THRESHOLD);

        let error_timeout;
        let error_rs: Function;

        try {
            return await Promise.race([
                new Promise<void>((rs, rj) => {
                    error_rs = rs;
                    error_timeout = setTimeout(() => {
                        rj(new Error('Characteristic "' + characteristic.displayName + '" of accessory "' +
                            accessory.displayName + '" took more than ' + WRITE_TIMEOUT_ERROR_DISPLAY_THRESHOLD +
                            ' to respond'));
                    }, WRITE_TIMEOUT_ERROR_THRESHOLD);
                }),
                characteristic.handleSetRequest(value, connection),
            ]);
        } finally {
            clearTimeout(warning_timeout);
            clearTimeout(error_timeout);
            error_rs!();
        }
    }

    /**
     * Handles resource requests.
     *
     * @param {object} data
     * @return {Promise}
     */
    async handleResource(data: ResourceRequest) {
        const accessory = 'aid' in data ? this.getAccessoryByID(data.aid!) : this.bridge;

        if (accessory && data['resource-type'] === ResourceRequestType.IMAGE) {
            // @ts-expect-error
            const controller: CameraController | null = accessory.activeCameraController ?? null;

            if (controller) {
                return controller.handleSnapshotRequest(
                    data['image-height'], data['image-width'], accessory.displayName
                );
            }
        }

        const err = new Error('Resource not found');
        // @ts-expect-error
        err.httpCode = HAPHTTPCode.NOT_FOUND;
        // @ts-expect-error
        err.status = HAPStatus.RESOURCE_DOES_NOT_EXIST;
        throw err;
    }

    /**
     * Handles session close.
     *
     * @param {HAPConnection} connection
     * @return {Promise}
     */
    async handleSessionClose(connection: HAPConnection) {
        // @ts-expect-error
        const controller: CameraController | null = this.bridge.activeCameraController ?? null;
        if (controller) controller.handleCloseConnection(connection.sessionID);

        for (const accessory of this.accessories) {
            // @ts-expect-error
            const controller: CameraController | null = accessory.activeCameraController ?? null;
            if (controller) controller.handleCloseConnection(connection.sessionID);
        }

        // this._unsubscribeEvents(events);

        for (const key of connection.getRegisteredEvents()) {
            if (key.indexOf('.') === -1) continue;

            try {
                const [aid, iid] = key.split('.').map(n => parseInt(n));

                const characteristic = this.getCharacteristicByID(aid, iid);
                if (characteristic) characteristic.unsubscribe();
            } catch (err) {}
        }

        connection.clearRegisteredEvents();
    }
}
