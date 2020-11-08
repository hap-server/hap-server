
/* eslint valid-jsdoc: 'off' */

import * as process from 'process';
import * as crypto from 'crypto';
import * as path from 'path';
import * as url from 'url';
import * as querystring from 'querystring';
import {promises as fs, createReadStream} from 'fs';
import * as util from 'util';
import * as stream from 'stream';
import * as repl from 'repl';
import * as child_process from 'child_process';
import {v4 as genuuid} from 'uuid';
import _mkdirp = require('mkdirp');
import chalk from 'chalk';
import WebSocket = require('ws');
import * as http from 'http';
import * as persist from 'node-persist';

import {Accessory, Service, CameraController, HAPServer, Characteristic, Perms} from 'hap-nodejs';

import isEqual = require('lodash.isequal');

import Server from './server';
import PluginManager, {AuthenticatedUser} from './plugins';
import Homebridge from './homebridge';
import Permissions from './permissions';
import {hapStatus} from './hap-server';
import {
    PluginAccessory, PluginStandaloneAccessory, PluginAccessoryPlatformAccessory, HomebridgeAccessory,
} from './accessories';
import SystemInformation, {SystemInformationData} from './system-information';

import Logger from '../common/logger';

import {
    RequestMessages, RequestMessage, ProgressMessage, ResponseMessages, ResponseMessage,
    AuthenticateRequestMessage, UserManagementRequestMessage,
} from '../common/types/messages';
import {BroadcastMessage} from '../common/types/broadcast-messages';
import BinaryMessageType from '../common/types/binary-messages';
import {AccessoryHap, CharacteristicHap} from '../common/types/hap';
import {AccessoryType} from '../common/types/storage';
import {AccessoryStatus} from '../common/types/accessories';

const randomBytes = util.promisify(crypto.randomBytes);
const mkdirp = util.promisify(_mkdirp);

/**
 * Get/generate an Organisationally Unique Identifier for generating MAC addresses.
 *
 * @param {persist} storage
 * @return {Promise<Buffer>}
 */
async function getoui(storage: persist.LocalStorage) {
    const oui = await storage.getItem('OUI');
    if (oui) return Buffer.from(oui, 'hex');

    const bytes = await randomBytes(3);

    bytes[0] &= ~(1 << 6); // Set bit 7 to 1 (locally administered)
    bytes[0] |= (1 << 7); // Set bit 8 to 0 (unicast)

    await storage.setItem('OUI', bytes.toString('hex'));

    return bytes;
}

/**
 * Generate a MAC address.
 *
 * @param {persist} storage
 * @return {Promise<string>}
 */
async function genusername(storage: persist.LocalStorage) {
    const oui = await getoui(storage);
    const bytes = await randomBytes(3);

    return oui.slice(0, 1).toString('hex') + ':' +
        oui.slice(1, 2).toString('hex') + ':' +
        oui.slice(2, 3).toString('hex') + ':' +
        bytes.slice(0, 1).toString('hex') + ':' +
        bytes.slice(1, 2).toString('hex') + ':' +
        bytes.slice(2, 3).toString('hex');
}

let id = 0;

const message_methods: {
    [key: string]: string;
} = {
    'authenticate': 'handleAuthenticateMessage',
    'user-management': 'handleUserManagementMessage',
    'accessory-setup': 'handleAccessorySetupMessage',
};

const message_handlers: {
    [key: string]: string | ((this: Connection, data: RequestMessage, connection: Connection) => ResponseMessage);
} = {
    'get-accessory-uis': 'getWebInterfacePlugins', // deprecated
};

const hide_authentication_keys = [
    'password', 'token',
];

function messagehandler<T extends keyof RequestMessages>(
    type: T, handler?: (data: RequestMessages[T]) => void
): (target: Connection, method: string) => void {
    // @ts-ignore
    return messagehandler2.bind(null, type, handler);
}
function messagehandler2<T extends keyof RequestMessages, M extends string, A extends Array<any>>(
    type: T, handler: (data: RequestMessages[T]) => A, target: Connection & {
        // [M]: (...args: A) => Promise<ResponseMessages[T]> | ResponseMessages[T]
    }, method: M
) {
    if (handler) {
        const key = '_handleMessage-' + type + '-' + method;
        (target as any)[key] = function(messageid: number, data: RequestMessages[T]) {
            // eslint-disable-next-line prefer-spread
            return this.respond(messageid, this[method].apply(this, handler.call(this, data)));
        };
        message_methods[type] = key;
    } else {
        message_handlers[type] = method;
    }
}

const ws_map = new WeakMap<WebSocket, Connection>();

const DEVELOPMENT = true;

export default class Connection {
    readonly server!: Server;
    readonly ws!: WebSocket;
    readonly id!: number;
    readonly log!: Logger;
    authenticated_user: AuthenticatedUser | null = null;
    enable_accessory_discovery = false;
    enable_proxy_stdout = false;
    last_message: number | null = null;
    closed = false;
    readonly req!: http.IncomingMessage;
    readonly uploads: {
        filename: string;
        filepath: string;
        filehash: string;
        file: any;
    }[] = [];
    readonly open_consoles = new Map<any, any>();
    console_id = 0;
    /** Characteristics the client has subscribed to updates for */
    readonly events = new Set<any>();

    readonly permissions: Permissions;

    /* eslint-disable no-invalid-this */
    terminateInterval: NodeJS.Timeout = setInterval(() => {
        if (this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.ping();

        // A message was received less than 30 seconds ago
        if (this.last_message && this.last_message > Date.now() - 30000) return;

        this.ws.terminate();
    }, 15000);
    /* eslint-enable no-invalid-this */

    private asset_token: string | null = null;

    constructor(server: Server, ws: WebSocket, req: http.IncomingMessage) {
        Object.defineProperty(this, 'server', {value: server});
        Object.defineProperty(this, 'ws', {value: ws});
        Object.defineProperty(this, 'id', {enumerable: true, value: id++});
        Object.defineProperty(this, 'log', {value: server.log.withPrefix('Connection #' + this.id)});
        Object.defineProperty(this, 'req', {value: req});

        this.permissions = new Permissions(this);

        this.log.info('WebSocket connection from', this.req.connection.remoteAddress);
        // this.server.log.debug('WebSocket connection', this.id, this.ws);

        ws_map.set(this.ws, this);

        ws.on('message', message => {
            if (this.closed) {
                this.log.warn('Received message from closed connection...!?');
                this.ws.close();
                return;
            }

            this.last_message = Date.now();

            if (message instanceof Buffer) {
                this.log.info('Received binary message');
                const messageid = message.readUInt32BE(0);
                const type = message.readUInt16BE(4);
                const data = message.slice(6);

                this.handleBinaryMessage(messageid, type, data);
                return;
            }

            // this.server.log.debug('Received', this.id, message);

            if (message === 'pong') {
                this.log.info('Received ping response');
                return;
            }

            // @ts-ignore
            const match = message.match(/^\*([0-9]+)\:(.*)$/);

            if (!match) {
                this.log.error('Received invalid message');
                return;
            }

            const messageid = parseInt(match[1]);
            const data = match[2] !== 'undefined' ? JSON.parse(match[2]) : undefined;

            this.handleMessage(messageid, data);
        });

        ws.on('close', async code => {
            this.closed = true;
            clearInterval(this.terminateInterval);

            this.log.info('Connection closed with code', code);

            try {
                if (this.authenticated_user && this.authenticated_user.authentication_handler) {
                    this.authenticated_user.authentication_handler.handleDisconnect(this.authenticated_user, this);
                }
            } catch (err) {
                this.log.error('Error in disconnect handler', err);
            }

            for (const event_name of this.events) {
                const characteristic = this.server.getCharacteristic(event_name);
                if (!characteristic) {
                    this.log.warn('Unknown characteristic %s', event_name);
                    continue;
                }

                characteristic.unsubscribe();
                this.events.delete(event_name);
            }

            if (this.enable_accessory_discovery) {
                this.enable_accessory_discovery = false;
                this.server.decrementAccessoryDiscoveryCounter();
            }

            SystemInformation.unsubscribe(this);

            await Promise.all(this.uploads.map(file => fs.unlink(file.filepath)));
        });

        // ws.send('ping');
        ws.ping();
        ws.on('pong', () => this.last_message = Date.now());
    }

    static getConnectionForWebSocket(ws: WebSocket) {
        return ws_map.get(ws);
    }

    sendBroadcast(data: BroadcastMessage) {
        this.ws.send('**:' + JSON.stringify(data));
    }

    updateSystemInformation(data: Partial<SystemInformationData>) {
        this.sendBroadcast({
            type: 'update-system-information',
            data,
        });
    }

    async respond(messageid: number, data: ResponseMessage, error?: boolean): Promise<void>
    async respond(messageid: number, data: any, error: true): Promise<void>
    async respond(messageid: number, data: any, error = false) {
        if (data instanceof Promise) {
            try {
                data = await data;
            } catch (err) {
                this.log.error('Error in message handler', data.type, err);

                error = true;
                data = this.serialiseError(err);
            }
        }

        if (data instanceof Buffer) {
            const header = Buffer.alloc(6);
            const flags = error ? 1 : 0;

            header.writeUInt32BE(messageid, 0);
            header.writeUInt16BE(flags, 4);

            this.ws.send(Buffer.concat([header, data]));
        } else {
            this.ws.send((error ? '!' : '*') + messageid + ':' + JSON.stringify(data));
        }
    }

    sendProgress(messageid: number, data: ProgressMessage) {
        this.ws.send('&' + messageid + ':' + JSON.stringify(data));
    }

    serialiseError(err: any) {
        return {
            reject: true as const,
            error: err instanceof Error,
            constructor: err.constructor.name,
            data: err ? Object.assign({message: err.message, code: err.code, stack: err.stack}, err) : err,
        };
    }

    handleMessage(messageid: number, data: RequestMessage | 'ping') {
        // this.server.log.debug('Received message', data, 'from', this.id, 'with messageid', messageid);

        if (data === 'ping') {
            this.respond(messageid, 'pong');
            return;
        }

        try {
            if (data && data.type && message_methods[data.type]) {
                (this as any)[message_methods[data.type]].call(this, messageid, data);
            } else if (data && data.type && typeof message_handlers[data.type] === 'string') {
                this.respond(messageid, (this as any)[(message_handlers[data.type] as string)].call(this, data));
            } else if (data && data.type && typeof message_handlers[data.type] === 'function') {
                this.respond(messageid, (message_handlers[data.type] as Function).call(this, data, this));
            }
        } catch (err) {
            this.log.error('Error in message handler', data.type, err);
        }
    }

    handleBinaryMessage(messageid: number, type: BinaryMessageType, data: Buffer) {
        //
    }

    async getAssetToken() {
        if (this.asset_token) return this.asset_token;

        const bytes = await randomBytes(48);
        const token = bytes.toString('hex');

        this.log.info('Asset token', token);

        return this.asset_token = token;
    }

    static authoriseAssetRequest(
        server: Server,
        req: http.IncomingMessage & {
            cookies: {[key: string]: string};
            hap_server_connection?: Connection;
        },
        res: http.ServerResponse, next?: () => void
    ) {
        const {search} = url.parse(req.url!);
        const search_params = querystring.parse(search || '');
        const asset_token = search_params.token || req.cookies.asset_token;

        const connection = [...server.wss.clients].map(s => this.getConnectionForWebSocket(s))
            .find(c => c && c.ws.readyState === WebSocket.OPEN && c.asset_token === asset_token);

        if (!asset_token || !connection) {
            server.log('Unauthorised asset request', req.url);

            res.statusCode = 401;
            res.end('Unauthorised');

            return;
        }

        connection.log('Authenticated asset request', req.url);

        req.hap_server_connection = connection;

        next && next();
    }

    /**
     * Gets the UUID of every accessory.
     */
    @messagehandler('list-accessories')
    async listAccessories(): Promise<ResponseMessages['list-accessories']> {
        const uuids = [];

        for (const bridge of this.server.accessories.bridges) {
            uuids.push(bridge.uuid);
        }

        for (const accessory of this.server.accessories.accessories) {
            uuids.push(accessory.uuid);
        }

        for (const accessory of this.server.accessories.cached_accessories) {
            uuids.push(accessory.uuid);
        }

        for (const bridge of this.server.accessories.bridges) {
            if (!(bridge instanceof Homebridge)) continue;

            for (const accessory of bridge.bridge.bridgedAccessories) {
                uuids.push(accessory.UUID);
            }
        }

        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Gets the details of accessories.
     * This is what the accessory exposes.
     */
    @messagehandler('get-accessories', data => data.id)
    getAccessories(...id: string[]): Promise<ResponseMessages['get-accessories']> {
        return Promise.all(id.map(id => this.getAccessory(id)));
    }

    async getAccessory(uuid: string) {
        await this.permissions.assertCanGetAccessory(uuid);

        const accessory = this.server.getAccessory(uuid);
        if (!accessory) return null!;

        this.ensureIidsFor(accessory);

        // @ts-expect-error
        const hap = accessory.internalHAPRepresentation(false)[0] as AccessoryHap;

        // Add service subtypes and linked services
        // eslint-disable-next-line guard-for-in
        for (const index in accessory.services) {
            const service = accessory.services[index];
            const service_hap = hap.services[index];

            // Add the full service UUID to the HAP representation
            service_hap.type = service.UUID;

            service_hap.subtype = service.subtype;
            service_hap.linked_indexes = [];

            for (const linked_service of service.linkedServices as Service[]) {
                if (!accessory.services.includes(linked_service)) continue;

                service_hap.linked_indexes.push(accessory.services.indexOf(linked_service));
            }

            // eslint-disable-next-line guard-for-in
            for (const index in service.characteristics) {
                const characteristic = service.characteristics[index];
                const characteristic_hap = service_hap.characteristics[index];

                // Add the full characteristic UUID to the HAP representation
                characteristic_hap.type = characteristic.UUID;

                if (characteristic.UUID === Characteristic.ProgrammableSwitchEvent.UUID) {
                    // Special workaround for event only programmable switch event, which must always return null
                    characteristic_hap.value = null;
                } else if (!characteristic.props.perms.includes(Perms.PAIRED_READ)) {
                    characteristic_hap.value = undefined;
                } else {
                    characteristic_hap.value = characteristic.value;
                }
            }
        }

        return hap;
    }

    private ensureIidsFor(accessory: Accessory) {
        // Make sure an accessory ID is assigned to pass assertions in Accessory.toHAP
        if (typeof accessory.aid !== 'number') accessory.aid = 1;

        for (const service of accessory.services) {
            if (typeof service.iid !== 'number') service.iid = 1;

            for (const characteristic of service.characteristics) {
                if (typeof characteristic.iid !== 'number') characteristic.iid = 1;
            }
        }

        for (const a of accessory.bridgedAccessories) {
            this.ensureIidsFor(a);
        }
    }

    /**
     * Gets the details of accessories.
     * This is what the accessory exposes.
     */
    @messagehandler('get-accessories-status', data => data.id)
    getAccessoriesStatus(...id: string[]): Promise<ResponseMessages['get-accessories-status']> {
        return Promise.all(id.map(id => this.getAccessoryStatus(id)));
    }

    async getAccessoryStatus(uuid: string) {
        await this.permissions.assertCanGetAccessory(uuid);

        if (this.server.accessories.bridges.find(b => b.uuid === uuid)) {
            return AccessoryStatus.READY;
        }

        const accessory = this.server.getPluginAccessory(uuid);
        if (!accessory) return AccessoryStatus.NOT_READY;

        return accessory.status;
    }

    /**
     * Gets accessory configuration.
     */
    @messagehandler('get-accessories-configuration', data => data.id)
    getAccessoriesConfiguration(...id: string[]): Promise<ResponseMessages['get-accessories-configuration']> {
        return Promise.all(id.map(id => this.getAccessoryConfiguration(id)));
    }

    async getAccessoryConfiguration(uuid: string): Promise<ResponseMessages['get-accessories-configuration'][0]> {
        await this.permissions.assertCanGetAccessoryConfig(uuid);

        const plugin_accessory = this.server.getPluginAccessory(uuid);
        if (!plugin_accessory) return null!;

        // eslint-disable-next-line curly
        if (plugin_accessory instanceof HomebridgeAccessory) return {
            is_writable: false,
            is_homebridge: true,
        };

        // eslint-disable-next-line curly
        if (plugin_accessory instanceof PluginAccessoryPlatformAccessory &&
            plugin_accessory.accessory_platform
        ) return {
            is_writable: false,
            type: AccessoryType.ACCESSORY_PLATFORM,
            accessory_platform: plugin_accessory.accessory_platform.uuid,
            plugin_name: plugin_accessory.plugin?.name,
            platform_name: plugin_accessory.accessory_platform_name,
            config: plugin_accessory.accessory_platform.config,
            accessories: plugin_accessory.accessory_platform.accessories.map(a => a.uuid),
        };

        // eslint-disable-next-line curly
        if (plugin_accessory instanceof PluginStandaloneAccessory &&
            await this.server.storage.getItem('Accessory.' + uuid)
        ) return {
            is_writable: true,
            type: AccessoryType.ACCESSORY,
            plugin: plugin_accessory.plugin?.name,
            accessory: plugin_accessory.accessory_type,
            config: (await this.server.storage.getItem('Accessory.' + uuid)).config,
        };

        // eslint-disable-next-line curly
        if (plugin_accessory instanceof PluginStandaloneAccessory &&
            !await this.server.storage.getItem('Accessory.' + uuid)
        ) return {
            is_writable: true,
            type: AccessoryType.ACCESSORY,
            plugin: plugin_accessory.plugin?.name,
            accessory: plugin_accessory.accessory_type,
            config: plugin_accessory.config,
        };

        return {
            is_writable: false,
        };
    }

    /**
     * Sets accessory configuration.
     */
    @messagehandler('set-accessories-configuration', data => data.id_data)
    setAccessoriesConfiguration(
        ...id_data: [string, any][]
    ): Promise<ResponseMessages['set-accessories-configuration']> {
        return Promise.all(id_data.map(([id, data]) => this.setAccessoryConfiguration(id, data)));
    }

    async setAccessoryConfiguration(uuid: string, config: any) {
        await this.permissions.assertCanSetAccessoryConfig(uuid);

        const plugin_accessory = this.server.getPluginAccessory(uuid);
        if (!plugin_accessory || !(plugin_accessory instanceof PluginStandaloneAccessory)) return null!;

        const current_data = await this.server.storage.getItem('Accessory.' + uuid);
        if (!current_data || current_data.type !== AccessoryType.ACCESSORY) return null!;

        await this.server.storage.setItem('Accessory.' + uuid, {
            type: AccessoryType.ACCESSORY,
            config,
        });

        plugin_accessory.reload(config);
    }

    /**
     * Gets accessory platform configuration.
     */
    @messagehandler('get-accessory-platforms-configuration', data => data.id)
    getAccessoryPlatformsConfiguration(
        ...id: string[]
    ): Promise<ResponseMessages['get-accessory-platforms-configuration']> {
        return Promise.all(id.map(id => this.getAccessoryPlatformConfiguration(id)));
    }

    async getAccessoryPlatformConfiguration(
        uuid: string
    ): Promise<ResponseMessages['get-accessory-platforms-configuration'][0]> {
        const accessory_platform = this.server.accessories.accessory_platforms.find(p => p.uuid === uuid);
        if (!accessory_platform) return null!;

        // Accessory platform configuration can be accessed by users that have access to the configuration of any
        // of it's accessories
        if (!(await Promise.all(accessory_platform.accessories
            .map(a => this.permissions.checkCanGetAccessoryConfig(a.uuid)))).find(a => a)
        ) {
            throw new Error('You don\'t have permission to access this accessory platform\'s configuration.');
        }

        // Accessory platform configuration can be updated by users that can update the configuration of all of it's
        // accessories
        let can_set = true;
        if ((await Promise.all(accessory_platform.accessories
            .map(a => this.permissions.checkCanSetAccessoryConfig(a.uuid)))).find(a => !a)
        ) {
            can_set = false;
        }

        return {
            is_writable: !!await this.server.storage.getItem('Accessory.' + uuid),
            can_set,
            type: AccessoryType.ACCESSORY_PLATFORM,
            config: accessory_platform.config,
            accessories: accessory_platform.accessories.map(a => a.uuid),
        };
    }

    /**
     * Sets accessory platform configuration.
     */
    @messagehandler('set-accessory-platforms-configuration', data => data.id_data)
    setAccessoryPlatformsConfiguration(
        ...id_data: [string, any][]
    ): Promise<ResponseMessages['set-accessory-platforms-configuration']> {
        return Promise.all(id_data.map(([id, data]) => this.setAccessoryPlatformConfiguration(id, data)));
    }

    async setAccessoryPlatformConfiguration(uuid: string, config: any) {
        const accessory_platform = this.server.accessories.accessory_platforms.find(p => p.uuid === uuid);
        if (!accessory_platform) return null!;

        // Accessory platform configuration can be accessed by users that have access to the configuration of any
        // of it's accessories
        if (!(await Promise.all(accessory_platform.accessories
            .map(a => this.permissions.checkCanGetAccessoryConfig(a.uuid)))).find(a => a)
        ) {
            throw new Error('You don\'t have permission to access this accessory platform\'s configuration.');
        }

        const current_data = await this.server.storage.getItem('Accessory.' + uuid);
        if (!current_data || current_data.type !== AccessoryType.ACCESSORY_PLATFORM) return null!;

        await this.server.storage.setItem('Accessory.' + uuid, {
            type: AccessoryType.ACCESSORY_PLATFORM,
            config,
        });

        accessory_platform.reload(config);
    }

    /**
     * Gets the user's permissions for accessories.
     */
    @messagehandler('get-accessories-permissions', data => data.id)
    getAccessoriesPermissions(...id: string[]): Promise<ResponseMessages['get-accessories-permissions']> {
        return Promise.all(id.map(id => this.getAccessoryPermissions(id)));
    }

    async getAccessoryPermissions(uuid: string) {
        const accessory = this.server.getAccessory(uuid);
        if (!accessory) return null!;

        const [get, set, get_config, set_config, set_characteristics] = await Promise.all([
            this.permissions.checkCanGetAccessory(uuid),
            this.permissions.checkCanSetAccessoryData(uuid),
            this.permissions.checkCanGetAccessoryConfig(uuid),
            this.permissions.checkCanSetAccessoryConfig(uuid),

            this.getCharacteristicsWithSetPermission(accessory),
        ]);

        return {get, set, get_config, set_config: set_config, set_characteristics};
    }

    async getCharacteristicsWithSetPermission(accessory: Accessory) {
        const services: {
            [service_id: string]: string[];
        } = {};

        await Promise.all(accessory.services.map(async service => {
            const characteristics: string[] = [];
            await Promise.all(service.characteristics.map(async characteristic => {
                if (await this.permissions.checkCanSetCharacteristic(accessory.UUID, service.UUID,
                    // @ts-ignore
                    characteristic.UUID)) characteristics.push(characteristic.UUID);
            }));
            if (characteristics.length) {
                services[service.UUID + (service.subtype ? '.' + service.subtype : '')] = characteristics;
            }
        }));

        // await Promise.all(service.characteristics.map(async characteristic => this.permissions.checkCanSetCharacteristic(uuid, service.UUID, characteristic.UUID).then(can_set => can_set ? characteristic.UUID)))

        return services;
    }

    /**
     * Gets the value of a characteristic.
     */
    @messagehandler('get-characteristics', data => data.ids)
    getCharacteristics(...ids: [string, string, string][]): Promise<ResponseMessages['get-characteristics']> {
        return Promise.all(ids.map(ids => this.getCharacteristic(ids[0], ids[1], ids[2])));
    }

    async getCharacteristic(accessory_uuid: string, service_uuid: string, characteristic_uuid: string) {
        await this.permissions.assertCanGetAccessory(accessory_uuid);

        const accessory = this.server.getAccessory(accessory_uuid);
        if (!accessory) return null!;

        const characteristic = this.server.getCharacteristic(accessory_uuid, service_uuid, characteristic_uuid);
        if (!characteristic) return null!;

        const hap = characteristic.internalHAPRepresentation() as CharacteristicHap;

        hap.type = characteristic.UUID;

        try {
            if (accessory[PluginAccessory.symbol]?.status !== AccessoryStatus.READY) {
                // @ts-ignore
                throw new Error(HAPServer.Status.SERVICE_COMMUNICATION_FAILURE);
            }

            hap.value = await this.server.getCharacteristicValue(characteristic, {
                [ConnectionSymbol]: this,
            });
        } catch (err) {
            hap.status = hapStatus(err);
        }

        return hap;
    }

    /**
     * Sets the value of a characteristic.
     */
    @messagehandler('set-characteristics', data => data.ids_data)
    setCharacteristics(...ids: [string, string, string, any][]): Promise<ResponseMessages['set-characteristics']> {
        return Promise.all(ids.map(ids => this.setCharacteristic(ids[0], ids[1], ids[2], ids[3])));
    }

    async setCharacteristic(accessory_uuid: string, service_uuid: string, characteristic_uuid: string, value: any) {
        await this.permissions.assertCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value);

        const accessory = this.server.getAccessory(accessory_uuid);
        if (!accessory) return null!;

        const characteristic = this.server.getCharacteristic(accessory_uuid, service_uuid, characteristic_uuid);
        if (!characteristic) {
            this.log.warn('Unknown characteristic %s, %s, %s',
                accessory_uuid, service_uuid, characteristic_uuid);
            return null!;
        }

        try {
            if (accessory[PluginAccessory.symbol]?.status !== AccessoryStatus.READY) {
                // @ts-ignore
                throw new Error(HAPServer.Status.SERVICE_COMMUNICATION_FAILURE);
            }

            await this.server.setCharacteristicValue(characteristic, value, {
                [ConnectionSymbol]: this,
            });
        } catch (err) {
            return {
                status: hapStatus(err),
            };
        }
    }

    /**
     * Subscribes to characteristic updates.
     */
    @messagehandler('subscribe-characteristics', data => data.ids)
    subscribeCharacteristics(
        ...ids: [string, string, string][]
    ): Promise<ResponseMessages['subscribe-characteristics']> {
        return Promise.all(ids.map(ids => this.subscribeCharacteristic(ids[0], ids[1], ids[2])));
    }

    async subscribeCharacteristic(accessory_uuid: string, service_uuid: string, characteristic_uuid: string) {
        await this.permissions.assertCanGetAccessory(accessory_uuid);

        const accessory = this.server.getAccessory(accessory_uuid);
        if (!accessory) return this.log.warn('Unknown accessory %s', accessory_uuid);

        const service_type = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
        const service_subtype = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(service_uuid.indexOf('.') + 1) : undefined;

        const service = accessory.services.find(service => service.UUID === service_type &&
            ((!service.subtype && !service_subtype) || service.subtype === service_subtype));
        if (!service) return this.log.warn('Unknown service %s', service_uuid);

        const characteristic: any = service.characteristics.find((c: any) => c.UUID === characteristic_uuid);
        if (!characteristic) return this.log.warn('Unknown characteristic %s', characteristic_uuid);

        const event_name = accessory.UUID + '.' + service.UUID + (service.subtype ? '.' + service.subtype : '') + '.' +
            characteristic.UUID;

        if (this.events.has(event_name)) {
            this.log.warn('Already subscribed to characteristic', accessory_uuid, service_uuid, characteristic_uuid);
            return;
        }

        this.events.add(event_name);
        characteristic.subscribe();
    }

    /**
     * Unsubscribes from characteristic updates.
     */
    @messagehandler('unsubscribe-characteristics', data => data.ids)
    unsubscribeCharacteristics(
        ...ids: [string, string, string][]
    ): Promise<ResponseMessages['unsubscribe-characteristics']> {
        return Promise.all(ids.map(ids => this.unsubscribeCharacteristic(ids[0], ids[1], ids[2])));
    }

    async unsubscribeCharacteristic(accessory_uuid: string, service_uuid: string, characteristic_uuid: string) {
        await this.permissions.assertCanGetAccessory(accessory_uuid);

        const accessory = this.server.getAccessory(accessory_uuid);
        if (!accessory) return this.log.warn('Unknown accessory %s', accessory_uuid);

        const service_type = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
        const service_subtype = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(service_uuid.indexOf('.') + 1) : undefined;

        const service = accessory.services.find(service => service.UUID === service_type &&
            ((!service.subtype && !service_subtype) || service.subtype === service_subtype));
        if (!service) return this.log.warn('Unknown service %s', service_uuid);

        const characteristic: any = service.characteristics.find((c: any) => c.UUID === characteristic_uuid);
        if (!characteristic) return this.log.warn('Unknown characteristic %s', characteristic_uuid);

        const event_name = accessory.UUID + '.' + service.UUID + (service.subtype ? '.' + service.subtype : '') + '.' +
            characteristic.UUID;

        if (!this.events.has(event_name)) {
            this.log.warn('Not subscribed to characteristic', accessory_uuid, service_uuid, characteristic_uuid);
            return;
        }

        characteristic.unsubscribe();
        this.events.delete(event_name);
    }

    /**
     * Requests a snapshot image.
     */
    @messagehandler('request-snapshot', data => [data.id, data.request])
    async requestSnapshot(accessory_uuid: string, request: {height: number; width: number}) {
        await this.permissions.assertCanGetAccessory(accessory_uuid);

        const accessory = this.server.getAccessory(accessory_uuid);
        if (!accessory) return this.log.warn('Unknown accessory %s', accessory_uuid);

        // @ts-expect-error
        const controller: CameraController | null = accessory.activeCameraController ?? null;

        if (!controller) return this.log.warn('Accessory %s doesn\'t have a camera controller', accessory_uuid);

        return controller.handleSnapshotRequest(request.height, request.width, accessory.displayName);
    }

    /**
     * Gets history records.
     */
    @messagehandler('get-history-records', data => data.ids_date_range)
    getCharacteristicsHistoryRecords(...ids: string[]): Promise<ResponseMessages['get-history-records']> {
        return Promise.all(ids.map(ids =>
            this.getHistoryRecords(ids[1], ids[1], ids[2], new Date(ids[3]), new Date(ids[4]))));
    }

    async getHistoryRecords(
        accessory_uuid: string, service_id: string, characteristic_uuid: string, from: Date, to: Date
    ): Promise<ResponseMessages['get-history-records'][0]> {
        await this.permissions.assertCanGetCharacteristicHistory(accessory_uuid, service_id, characteristic_uuid);

        const accessory = this.server.getAccessory(accessory_uuid);
        const service = this.server.getService(accessory_uuid, service_id);
        const characteristic = this.server.getCharacteristic(accessory_uuid, service_id, characteristic_uuid);

        if (!accessory || !service || !characteristic) return null!;

        const records = this.server.history!.findRecords(accessory, service, characteristic, from, to);

        return records;
    }

    /**
     * Gets the details of accessories.
     * This is stored by the web UI.
     */
    @messagehandler('get-accessories-data', data => data.id)
    getAccessoriesData(...id: string[]): Promise<ResponseMessages['get-accessories-data']> {
        return Promise.all(id.map(id => this.getAccessoryData(id)));
    }

    async getAccessoryData(id: string) {
        await this.permissions.assertCanGetAccessory(id);

        //
        this.log.debug('Getting data for accessory', id);

        return await this.server.storage.getItem('AccessoryData.' + id) || {};
    }

    /**
     * Sets extra data of accessories.
     * This is stored by the web UI.
     */
    @messagehandler('set-accessories-data', data => data.id_data)
    setAccessoriesData(...id_data: [string, any][]): Promise<ResponseMessages['set-accessories-data']> {
        return Promise.all(id_data.map(([id, data]) => this.setAccessoryData(id, data)));
    }

    async setAccessoryData(uuid: string, data: any) {
        await this.permissions.assertCanSetAccessoryData(uuid);

        //
        this.log.debug('Setting data for accessory', uuid, data);

        await this.server.storage.setItem('AccessoryData.' + uuid, data);

        this.server.sendBroadcast({
            type: 'update-accessory-data',
            uuid,
            data,
        }, this.ws);
    }

    /**
     * Starts accessory discovery.
     */
    @messagehandler('start-accessory-discovery')
    async startAccessoryDiscovery(): Promise<ResponseMessages['start-accessory-discovery']> {
        await this.permissions.assertCanCreateAccessories();

        if (!this.enable_accessory_discovery) {
            this.enable_accessory_discovery = true;
            this.server.incrementAccessoryDiscoveryCounter();
        }

        // return this.getDiscoveredAccessories();
    }

    /**
     * Gets discovered accessories.
     */
    @messagehandler('get-discovered-accessories')
    async getDiscoveredAccessories(): Promise<ResponseMessages['get-discovered-accessories']> {
        await this.permissions.assertCanCreateAccessories();

        return this.server.getDiscoveredAccessories().map(discovered_accessory => ({
            plugin: discovered_accessory.accessory_discovery.plugin ?
                discovered_accessory.accessory_discovery.plugin.name : null,
            accessory_discovery: discovered_accessory.accessory_discovery.id,
            id: discovered_accessory.id,
            data: discovered_accessory,
        }));
    }

    /**
     * Stops accessory discovery.
     */
    @messagehandler('stop-accessory-discovery')
    async stopAccessoryDiscovery(): Promise<ResponseMessages['stop-accessory-discovery']> {
        await this.permissions.assertCanCreateAccessories();

        if (!this.enable_accessory_discovery) return;

        this.enable_accessory_discovery = false;
        this.server.decrementAccessoryDiscoveryCounter();
    }

    /**
     * Creates accessories.
     */
    @messagehandler('create-accessories', data => data.data)
    createAccessories(...data: any[]): Promise<ResponseMessages['create-accessories']> {
        return Promise.all(data.map(data => this.createAccessory(data)));
    }

    async createAccessory(config: any) {
        await this.permissions.assertCanCreateAccessories();

        const uuid = genuuid();

        this.log.debug('Creating accessory', uuid, config);

        await this.server.storage.setItem('Accessory.' + uuid, {
            type: AccessoryType.ACCESSORY,
            config,
        });

        const accessory_uuids = await this.server.storage.getItem('Accessories') || [];
        if (!accessory_uuids.includes(uuid)) {
            accessory_uuids.push(uuid);
            await this.server.storage.setItem('Accessories', accessory_uuids);
        }

        this.server.accessories.loadAccessory(config, uuid);

        this.server.sendBroadcast({
            type: 'add-accessory',
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Creates accessory platforms.
     */
    @messagehandler('create-accessory-platforms', data => data.data)
    createAccessoryPlatforms(...data: any[]): Promise<ResponseMessages['create-accessory-platforms']> {
        return Promise.all(data.map(data => this.createAccessoryPlatform(data)));
    }

    async createAccessoryPlatform(config: any) {
        await this.permissions.assertCanCreateAccessories();

        const uuid = genuuid();

        this.log.debug('Creating accessory platform', uuid, config);

        await this.server.storage.setItem('Accessory.' + uuid, {
            type: AccessoryType.ACCESSORY_PLATFORM,
            config,
        });

        const accessory_uuids = await this.server.storage.getItem('Accessories') || [];
        if (!accessory_uuids.includes(uuid)) {
            accessory_uuids.push(uuid);
            await this.server.storage.setItem('Accessories', accessory_uuids);
        }

        this.server.accessories.loadAccessoryPlatform(config, uuid);

        return uuid;
    }

    /**
     * Removes accessories.
     */
    @messagehandler('delete-accessories', data => data.id)
    deleteAccessories(id: string[]): Promise<ResponseMessages['delete-accessories']> {
        return Promise.all(id.map(id => this.deleteAccessory(id)));
    }

    async deleteAccessory(uuid: string) {
        await this.permissions.assertCanDeleteAccessory(uuid);

        this.log.debug('Removing accessory', uuid);

        const plugin_accessory = this.server.getPluginAccessory(uuid);
        if (!plugin_accessory || !(plugin_accessory instanceof PluginStandaloneAccessory)) return null!;

        this.server.accessories.removeAccessory(plugin_accessory);

        await this.server.storage.removeItem('Accessory.' + uuid);

        const accessory_uuids = await this.server.storage.getItem('Accessories') || [];
        let index;
        while ((index = accessory_uuids.indexOf(uuid)) > -1) {
            accessory_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Accessories', accessory_uuids);

        this.server.sendBroadcast({
            type: 'remove-accessory',
            uuid,
        }, this.ws);
    }

    /**
     * Creates accessory platforms.
     */
    @messagehandler('delete-accessory-platforms', data => data.id)
    deleteAccessoryPlatforms(id: any[]): Promise<ResponseMessages['delete-accessory-platforms']> {
        return Promise.all(id.map(id => this.deleteAccessoryPlatform(id)));
    }

    async deleteAccessoryPlatform(uuid: string) {
        const accessory_platform = this.server.accessories.accessory_platforms.find(p => p.uuid === uuid);
        if (!accessory_platform) return null!;

        // Accessory platforms can be deleted by users that have access to delete all of it's accessories
        if ((await Promise.all(accessory_platform.accessories
            .map(a => this.permissions.checkCanGetAccessoryConfig(a.uuid)))).find(a => !a)
        ) {
            throw new Error('You don\'t have permission to access this accessory platform\'s configuration.');
        }

        this.server.accessories.removeAccessoryPlatform(accessory_platform);

        this.log.debug('Deleting accessory platform', uuid);

        await this.server.storage.removeItem('Accessory.' + uuid);

        const accessory_uuids = await this.server.storage.getItem('Accessories') || [];
        let index;
        while ((index = accessory_uuids.indexOf(uuid)) > -1) {
            accessory_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Accessories', accessory_uuids);
    }

    /**
     * Gets global settings.
     */
    @messagehandler('get-home-settings')
    async getHomeSettings(): Promise<ResponseMessages['get-home-settings']> {
        await this.permissions.assertCanGetHomeSettings();

        this.log.debug('Getting global settings');

        return await this.server.storage.getItem('Home') || {};
    }

    /**
     * Gets the user's global permissions.
     */
    @messagehandler('get-home-permissions')
    async getHomePermissions(): Promise<ResponseMessages['get-home-permissions']> {
        const [
            get, set, add_accessories, create_layouts, has_automations, create_automations, create_bridges,
            server, users, permissions, plugins, console,
        ] = await Promise.all([
            this.permissions.checkCanGetHomeSettings(),
            this.permissions.checkCanSetHomeSettings(),
            this.permissions.checkCanCreateAccessories(),
            this.permissions.checkCanCreateLayouts(),
            this.permissions.getAuthorisedAutomationUUIDs().then(uuids => !!uuids.length),
            this.permissions.checkCanCreateAutomations(),
            this.permissions.checkCanCreateBridges(),
            this.permissions.checkCanAccessServerRuntimeInfo(),
            this.permissions.checkCanManageUsers(),
            this.permissions.checkCanManagePermissions(),
            this.permissions.checkCanManagePlugins(),
            this.permissions.checkCanOpenWebConsole(),
        ]);

        return {
            get, set, add_accessories, create_layouts, has_automations, create_automations, create_bridges,
            server, users, permissions, plugins, console,
        };
    }

    /**
     * Sets global settings.
     */
    @messagehandler('set-home-settings', data => [data.data])
    async setHomeSettings(data: any): Promise<ResponseMessages['set-home-settings']> {
        await this.permissions.assertCanSetHomeSettings();

        if (data.background_url && data.background_url.indexOf(path.sep) > -1) {
            throw new Error('Background filenames cannot have directory separators');
        }

        this.log.debug('Setting global settings', data);

        const previous_data = await this.server.storage.getItem('Home');

        await this.server.storage.setItem('Home', data);

        let index;
        while ((index = this.uploads.findIndex(f => f.filename === data.background_url)) > -1) {
            this.uploads.splice(index, 1);
        }

        this.server.sendBroadcast({
            type: 'update-home-settings',
            data,
        }, this.ws);

        if (previous_data && previous_data.background_url && previous_data.background_url !== data.background_url) {
            for (const layout_uuid of await this.server.storage.getItem('Layouts')) {
                const layout = await this.server.storage.getItem('Layout.' + layout_uuid);

                if (layout && layout.background_url === previous_data.background_url) return;
            }

            // Delete the old background image as no other layout is using it
            await fs.unlink(path.join(this.server.assets_path, previous_data.background_url));
        }
    }

    /**
     * Gets the UUID of every layout.
     */
    @messagehandler('list-layouts')
    async listLayouts(): Promise<ResponseMessages['list-layouts']> {
        const uuids: string[] = [].concat(await this.server.storage.getItem('Layouts'));

        if (this.authenticated_user && !uuids.includes('Overview.' + this.authenticated_user.id)) {
            uuids.push('Overview.' + this.authenticated_user.id);
        }

        const authorised_uuids = await this.permissions.getAuthorisedLayoutUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Creates layouts.
     */
    @messagehandler('create-layouts', data => data.data)
    createLayouts(...data: any[]): Promise<ResponseMessages['create-layouts']> {
        return Promise.all(data.map(data => this.createLayout(data)));
    }

    async createLayout(data: any) {
        await this.permissions.assertCanCreateLayouts();

        if (data.background_url && data.background_url.indexOf(path.sep) > -1) {
            throw new Error('Background filenames cannot have directory separators');
        }

        const uuid = genuuid();

        this.log.debug('Creating layout', uuid, data);

        await this.server.storage.setItem('Layout.' + uuid, data);

        const layout_uuids = await this.server.storage.getItem('Layouts') || [];
        if (!layout_uuids.includes(uuid)) {
            layout_uuids.push(uuid);
            await this.server.storage.setItem('Layouts', layout_uuids);
        }

        let index;
        while ((index = this.uploads.findIndex(f => f.filename === data.background_url)) > -1) {
            this.uploads.splice(index, 1);
        }

        this.server.sendBroadcast({
            type: 'add-layout',
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of layouts.
     */
    @messagehandler('get-layouts', data => data.id)
    getLayouts(...id: string[]): Promise<ResponseMessages['get-layouts']> {
        return Promise.all(id.map(id => this.getLayout(id)));
    }

    async getLayout(id: string) {
        await this.permissions.assertCanGetLayout(id);

        this.log.debug('Getting data for layout', id);

        return await this.server.storage.getItem('Layout.' + id) || {};
    }

    /**
     * Gets the user's permissions for layouts.
     */
    @messagehandler('get-layouts-permissions', data => data.id)
    getLayoutsPermissions(...id: string[]): Promise<ResponseMessages['get-layouts-permissions']> {
        return Promise.all(id.map(id => this.getLayoutPermissions(id)));
    }

    async getLayoutPermissions(uuid: string) {
        const [get, set, del] = await Promise.all([
            this.permissions.checkCanGetLayout(uuid),
            this.permissions.checkCanSetLayout(uuid),
            this.permissions.checkCanDeleteLayout(uuid),
        ]);

        return {get, set, delete: del};
    }

    /**
     * Sets data of layouts.
     */
    @messagehandler('set-layouts', data => data.id_data)
    setLayouts(...id_data: [string, any][]): Promise<ResponseMessages['set-layouts']> {
        return Promise.all(id_data.map(([id, data]) => this.setLayout(id, data)));
    }

    async setLayout(uuid: string, data: any) {
        await this.permissions.assertCanSetLayout(uuid);

        if (data.background_url && data.background_url.indexOf(path.sep) > -1) {
            throw new Error('Background filenames cannot have directory separators');
        }

        this.log.debug('Setting data for layout', uuid, data);

        const previous_data = await this.server.storage.getItem('Layout.' + uuid);

        await this.server.storage.setItem('Layout.' + uuid, data);

        const layout_uuids = await this.server.storage.getItem('Layouts') || [];
        if (!layout_uuids.includes(uuid)) {
            layout_uuids.push(uuid);
            await this.server.storage.setItem('Layouts', layout_uuids);
        }

        let index;
        while ((index = this.uploads.findIndex(f => f.filename === data.background_url)) > -1) {
            this.uploads.splice(index, 1);
        }

        this.server.sendBroadcast({
            type: 'update-layout',
            uuid,
            data,
        }, this.ws);

        if (previous_data && previous_data.background_url && previous_data.background_url !== data.background_url) {
            const home_settings = await this.server.storage.getItem('Home');

            if (home_settings && home_settings.background_url === previous_data.background_url) return;

            for (const layout_uuid of await this.server.storage.getItem('Layouts')) {
                const layout = await this.server.storage.getItem('Layout.' + layout_uuid);

                if (layout && layout.background_url === previous_data.background_url) return;
            }

            // Delete the old background image as no other layout is using it
            await fs.unlink(path.join(this.server.assets_path, previous_data.background_url));
        }
    }

    /**
     * Handle layout background uploads.
     * This does not happen over the WebSocket.
     *
     * The user will have already authenticated with an asset token.
     */
    static async handleUploadLayoutBackground(server: Server, req: http.IncomingMessage & {
        file: {
            path: string;
            originalname: string;
        };
        hap_server_connection: Connection;
    }, res: http.ServerResponse) {
        const connection = req.hap_server_connection;

        try {
            const response = await connection.handleUploadLayoutBackground(req, res);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(response));
        } catch (err) {
            connection.log.error('Error uploading layout background', err);

            await fs.unlink(req.file.path);

            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Error');
        }
    }

    async handleUploadLayoutBackground(req: http.IncomingMessage & {
        file: {
            path: string;
            originalname: string;
        };
    }, res: http.ServerResponse) {
        this.log(req.file);

        const stream = createReadStream(req.file.path);
        const hash = crypto.createHash('sha1');
        hash.setEncoding('hex');

        stream.pipe(hash);

        const filehash: string = await new Promise((resolve, reject) => {
            stream.on('error', err => reject(err));
            stream.on('end', () => {
                hash.end();
                resolve(hash.read() as string);
            });
        });

        const filename = filehash + path.extname(req.file.originalname);
        const filepath = path.join(this.server.assets_path, filename);

        if (await fs.stat(filepath).then(stat => true, err => false)) {
            await fs.unlink(req.file.path);

            return {
                name: filename,
            };
        }

        await mkdirp(this.server.assets_path);
        await fs.rename(req.file.path, filepath);

        this.uploads.push({
            filename,
            filepath,
            filehash,
            file: req.file,
        });

        return {
            name: filename,
        };
    }

    /**
     * Deletes layouts.
     */
    @messagehandler('delete-layouts', data => data.id)
    deleteLayouts(...id: string[]): Promise<ResponseMessages['delete-layouts']> {
        return Promise.all(id.map(id => this.deleteLayout(id)));
    }

    async deleteLayout(uuid: string) {
        await this.permissions.assertCanDeleteLayout(uuid);

        this.log.debug('Deleting layout', uuid);

        const data = await this.server.storage.getItem('Layout.' + uuid);

        const section_uuids = await this.server.storage.getItem('LayoutSections.' + uuid) || [];
        for (const section_uuid of section_uuids) {
            await this.server.storage.removeItem('LayoutSection.' + uuid + '.' + section_uuid);
        }

        await this.server.storage.removeItem('LayoutSections.' + uuid);
        await this.server.storage.removeItem('Layout.' + uuid);

        const layout_uuids = await this.server.storage.getItem('Layouts') || [];
        let index;
        while ((index = layout_uuids.indexOf(uuid)) > -1) {
            layout_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Layouts', layout_uuids);

        this.server.sendBroadcast({
            type: 'remove-layout',
            uuid,
        }, this.ws);

        if (data && data.background_url) {
            const home_settings = await this.server.storage.getItem('Home');

            if (home_settings && home_settings.background_url === data.background_url) return;

            for (const layout_uuid of await this.server.storage.getItem('Layouts')) {
                const layout = await this.server.storage.getItem('Layout.' + layout_uuid);

                if (layout && layout.background_url === data.background_url) return;
            }

            // Delete the background image as no other layout is using it
            await fs.unlink(path.join(this.server.assets_path, data.background_url));
        }
    }

    /**
     * Gets the UUID of every layout section.
     */
    @messagehandler('list-layout-sections', data => data.id)
    listAllLayoutSections(...id: string[]): Promise<ResponseMessages['list-layout-sections']> {
        return Promise.all(id.map(id => this.listLayoutSections(id)));
    }

    async listLayoutSections(uuid: string) {
        await this.permissions.assertCanGetLayout(uuid);

        return await this.server.storage.getItem('LayoutSections.' + uuid) || [];
    }

    /**
     * Creates layout sections.
     */
    @messagehandler('create-layout-sections', data => data.id_data)
    createLayoutSections(...id_data: [string, any][]): Promise<ResponseMessages['create-layout-sections']> {
        return Promise.all(id_data.map(([layout_uuid, data]) => this.createLayoutSection(layout_uuid, data)));
    }

    async createLayoutSection(layout_uuid: string, data: any) {
        await this.permissions.assertCanSetLayout(layout_uuid);

        const uuid = genuuid();

        this.log.debug('Creating layout section', uuid, data);

        await this.server.storage.setItem('LayoutSection.' + layout_uuid + '.' + uuid, data);

        const section_uuids = await this.server.storage.getItem('LayoutSections.' + layout_uuid) || [];
        if (!section_uuids.includes(uuid)) {
            section_uuids.push(uuid);
            await this.server.storage.setItem('LayoutSections.' + layout_uuid, section_uuids);
        }

        this.server.sendBroadcast({
            type: 'add-layout-section',
            layout_uuid,
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of layouts.
     */
    @messagehandler('get-layout-sections', data => data.ids)
    getLayoutSections(...ids: [string, string][]): Promise<ResponseMessages['get-layout-sections']> {
        return Promise.all(ids.map(([layout_uuid, id]) => this.getLayoutSection(layout_uuid, id)));
    }

    async getLayoutSection(layout_uuid: string, uuid: string) {
        await this.permissions.assertCanGetLayout(layout_uuid);

        this.log.debug('Getting data for layout section', layout_uuid, uuid);

        return await this.server.storage.getItem('LayoutSection.' + layout_uuid + '.' + uuid) || {};
    }

    /**
     * Sets data of layout sections.
     */
    @messagehandler('set-layout-sections', data => data.ids_data)
    setLayoutSections(...ids_data: [string, string, any][]): Promise<ResponseMessages['set-layout-sections']> {
        return Promise.all(ids_data.map(([layout_uuid, id, data]) => this.setLayoutSection(layout_uuid, id, data)));
    }

    async setLayoutSection(layout_uuid: string, uuid: string, data: any) {
        await this.permissions.assertCanSetLayout(layout_uuid);

        this.log.debug('Setting data for layout section', layout_uuid, uuid, data);

        await this.server.storage.setItem('LayoutSection.' + layout_uuid + '.' + uuid, data);

        const section_uuids = await this.server.storage.getItem('LayoutSections.' + layout_uuid) || [];
        if (!section_uuids.includes(uuid)) {
            section_uuids.push(uuid);
            await this.server.storage.setItem('LayoutSections.' + layout_uuid, section_uuids);
        }

        this.server.sendBroadcast({
            type: 'update-layout-section',
            layout_uuid,
            uuid,
            data,
        }, this.ws);
    }

    /**
     * Deletes layout sections.
     */
    @messagehandler('delete-layout-sections', data => data.ids)
    deleteLayoutSections(...ids: [string, string][]): Promise<ResponseMessages['delete-layout-sections']> {
        return Promise.all(ids.map(([layout_uuid, id]) => this.deleteLayoutSection(layout_uuid, id)));
    }

    async deleteLayoutSection(layout_uuid: string, uuid: string) {
        await this.permissions.assertCanSetLayout(layout_uuid);

        this.log.debug('Deleting layout section', layout_uuid, uuid);

        const section_uuids = await this.server.storage.getItem('LayoutSections.' + layout_uuid) || [];
        let index;
        while ((index = section_uuids.indexOf(uuid)) > -1) {
            section_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('LayoutSections.' + layout_uuid, section_uuids);

        await this.server.storage.removeItem('LayoutSection.' + layout_uuid + '.' + uuid);

        this.server.sendBroadcast({
            type: 'remove-layout-section',
            layout_uuid,
            uuid,
        }, this.ws);
    }

    /**
     * Gets the UUID of every automation.
     */
    @messagehandler('list-automations')
    async listAutomations(): Promise<ResponseMessages['list-automations']> {
        const uuids: string[] = await this.server.storage.getItem('Automations') || [];

        const authorised_uuids = await this.permissions.getAuthorisedAutomationUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Creates automations.
     */
    @messagehandler('create-automations', data => data.data)
    createAutomations(...data: any[]): Promise<ResponseMessages['create-automations']> {
        return Promise.all(data.map(data => this.createAutomation(data)));
    }

    async createAutomation(data: any) {
        await this.permissions.assertCanCreateAutomations();

        const uuid = genuuid();

        this.log.debug('Creating automation', uuid, data);

        await this.server.storage.setItem('Automation.' + uuid, data);

        // Don't wait for the automation to load
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.server.loadAutomation(uuid, data).catch(() => {});

        const automation_uuids = await this.server.storage.getItem('Automations') || [];
        if (!automation_uuids.includes(uuid)) {
            automation_uuids.push(uuid);
            await this.server.storage.setItem('Automations', automation_uuids);
        }

        this.server.sendBroadcast({
            type: 'new-automation',
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of automations.
     */
    @messagehandler('get-automations', data => data.id)
    getAutomations(...id: any[]): Promise<ResponseMessages['get-automations']> {
        return Promise.all(id.map(id => this.getAutomation(id)));
    }

    async getAutomation(uuid: string) {
        await this.permissions.assertCanGetAutomation(uuid);

        this.log.debug('Getting data for automation', uuid);

        return await this.server.storage.getItem('Automation.' + uuid) || {};
    }

    /**
     * Gets the user's permissions for automations.
     */
    @messagehandler('get-automations-permissions', data => data.id)
    getAutomationsPermissions(...id: string[]): Promise<ResponseMessages['get-automations-permissions']> {
        return Promise.all(id.map(id => this.getAutomationPermissions(id)));
    }

    async getAutomationPermissions(uuid: string) {
        const [get, set, del] = await Promise.all([
            this.permissions.checkCanGetAutomation(uuid),
            this.permissions.checkCanSetAutomation(uuid),
            this.permissions.checkCanDeleteAutomation(uuid),
        ]);

        return {get, set, delete: del};
    }

    /**
     * Sets data of automations.
     */
    @messagehandler('set-automations', data => data.id_data)
    setAutomations(...id_data: [string, any][]): Promise<ResponseMessages['set-automations']> {
        return Promise.all(id_data.map(([id, data]) => this.setAutomation(id, data)));
    }

    async setAutomation(uuid: string, data: any) {
        await this.permissions.assertCanSetAutomation(uuid);

        this.log.debug('Setting data for automation', uuid, data);

        await this.server.storage.setItem('Automation.' + uuid, data);

        // Don't wait for the automation to load
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.server.updateAutomation(uuid, data).catch(() => {});

        const automation_uuids = await this.server.storage.getItem('Automations') || [];
        if (!automation_uuids.includes(uuid)) {
            automation_uuids.push(uuid);
            await this.server.storage.setItem('Automations', automation_uuids);
        }

        this.server.sendBroadcast({
            type: 'update-automation',
            uuid,
            data,
        }, this.ws);
    }

    /**
     * Deletes automations.
     */
    @messagehandler('delete-automations', data => data.id)
    deleteAutomations(...id: string[]): Promise<ResponseMessages['delete-automations']> {
        return Promise.all(id.map(id => this.deleteAutomation(id)));
    }

    async deleteAutomation(uuid: string) {
        await this.permissions.assertCanDeleteAutomation(uuid);

        this.log.debug('Stopping automation', uuid);

        const automation = this.server.automations.automations.find(automation => automation.uuid === uuid);
        if (automation) await this.server.automations.removeAutomation(automation);

        this.log.debug('Deleting automation', uuid);

        await this.server.storage.removeItem('Automation.' + uuid);

        const automation_uuids = await this.server.storage.getItem('Automations') || [];
        let index;
        while ((index = automation_uuids.indexOf(uuid)) > -1) {
            automation_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Automations', automation_uuids);

        this.server.sendBroadcast({
            type: 'remove-automation',
            uuid,
        }, this.ws);
    }

    /**
     * Gets the UUID of every scene.
     */
    @messagehandler('list-scenes')
    async listScenes(): Promise<ResponseMessages['list-scenes']> {
        const uuids: string[] = await this.server.storage.getItem('Scenes') || [];

        const authorised_uuids = await this.permissions.getAuthorisedSceneUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Creates scenes.
     */
    @messagehandler('create-scenes', data => data.data)
    createScenes(...data: any[]): Promise<ResponseMessages['create-scenes']> {
        return Promise.all(data.map(data => this.createScene(data)));
    }

    async createScene(data: any) {
        await this.permissions.assertCanCreateScenes();

        const uuid = genuuid();

        this.log.debug('Creating scene', uuid, data);

        await this.server.storage.setItem('Scene.' + uuid, data);

        // Don't wait for the automation to load
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.server.loadScene(uuid, data).catch(() => {});

        const scene_uuids = await this.server.storage.getItem('Scenes') || [];
        if (!scene_uuids.includes(uuid)) {
            scene_uuids.push(uuid);
            await this.server.storage.setItem('Scenes', scene_uuids);
        }

        this.server.sendBroadcast({
            type: 'add-scene',
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of scenes.
     */
    @messagehandler('get-scenes', data => data.id)
    getScenes(...id: string[]): Promise<ResponseMessages['get-scenes']> {
        return Promise.all(id.map(id => this.getScene(id)));
    }

    async getScene(uuid: string) {
        await this.permissions.assertCanGetScene(uuid);

        this.log.debug('Getting data for scene', uuid);

        return await this.server.storage.getItem('Scene.' + uuid) || {};
    }

    /**
     * Gets the user's permissions for scenes.
     */
    @messagehandler('get-scenes-permissions', data => data.id)
    getScenesPermissions(...id: string[]): Promise<ResponseMessages['get-scenes-permissions']> {
        return Promise.all(id.map(id => this.getScenePermissions(id)));
    }

    async getScenePermissions(uuid: string) {
        const [get, activate, set, del] = await Promise.all([
            this.permissions.checkCanGetScene(uuid),
            this.permissions.checkCanActivateScene(uuid),
            this.permissions.checkCanSetScene(uuid),
            this.permissions.checkCanDeleteScene(uuid),
        ]);

        return {get, activate, set, delete: del};
    }

    /**
     * Sets data of scenes.
     */
    @messagehandler('set-scenes', data => data.id_data)
    setScenes(...id_data: [string, any][]): Promise<ResponseMessages['set-scenes']> {
        return Promise.all(id_data.map(([id, data]) => this.setScene(id, data)));
    }

    async setScene(uuid: string, data: any) {
        await this.permissions.assertCanSetScene(uuid);

        this.log.debug('Setting data for scene', uuid, data);

        await this.server.storage.setItem('Scene.' + uuid, data);

        // Don't wait for the scene to load
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.server.updateScene(uuid, data).catch(() => {});

        const scene_uuids = await this.server.storage.getItem('Scenes') || [];
        if (!scene_uuids.includes(uuid)) {
            scene_uuids.push(uuid);
            await this.server.storage.setItem('Scenes', scene_uuids);
        }

        this.server.sendBroadcast({
            type: 'update-scene',
            uuid,
            data,
        }, this.ws);
    }

    /**
     * Checks if scenes are active.
     */
    @messagehandler('check-scenes-active', data => data.id)
    checkScenesActive(...id: string[]): Promise<ResponseMessages['check-scenes-active']> {
        return Promise.all(id.map(id => this.checkSceneActive(id)));
    }

    async checkSceneActive(uuid: string) {
        await this.permissions.assertCanGetScene(uuid);

        this.log.debug('Checking if scene is active', uuid);

        const scene = this.server.automations.getSceneByUUID(uuid);
        if (!scene) throw new Error('Unknown scene');

        try {
            return await scene.active;
        } catch (err) {
            return this.serialiseError(err);
        }
    }

    /**
     * Activates scenes.
     */
    @messagehandler('activate-scenes', data => data.id_data)
    activateScenes(...id_data: [string, any][]): Promise<ResponseMessages['activate-scenes']> {
        return Promise.all(id_data.map(([id, data]) => this.activateScene(id, data)));
    }

    async activateScene(uuid: string, context: any) {
        await this.permissions.assertCanGetScene(uuid);
        await this.permissions.assertCanActivateScene(uuid);

        this.log.debug('Activating scene', uuid, context);

        const scene = this.server.automations.getSceneByUUID(uuid);
        if (!scene) throw new Error('Unknown scene');

        await scene.enable(context);
    }

    /**
     * Deactivates scenes.
     */
    @messagehandler('deactivate-scenes', data => data.id_data)
    deactivateScenes(...id_data: [string, any][]): Promise<ResponseMessages['deactivate-scenes']> {
        return Promise.all(id_data.map(([id, data]) => this.deactivateScene(id, data)));
    }

    async deactivateScene(uuid: string, context: any) {
        await this.permissions.assertCanGetScene(uuid);
        await this.permissions.assertCanActivateScene(uuid);

        this.log.debug('Deactivating scene', uuid, context);

        const scene = this.server.automations.getSceneByUUID(uuid);
        if (!scene) throw new Error('Unknown scene');

        await scene.disable(context);
    }

    /**
     * Deletes scenes.
     */
    @messagehandler('delete-scenes', data => data.id)
    deleteScenes(...id: string[]): Promise<ResponseMessages['delete-scenes']> {
        return Promise.all(id.map(id => this.deleteScene(id)));
    }

    async deleteScene(uuid: string) {
        await this.permissions.assertCanDeleteScene(uuid);

        this.log.debug('Removing scene', uuid);

        const scene = this.server.automations.getSceneByUUID(uuid);
        if (scene) await this.server.automations.removeScene(scene);

        this.log.debug('Deleting scene', uuid);

        await this.server.storage.removeItem('Scene.' + uuid);

        const scene_uuids = await this.server.storage.getItem('Scenes') || [];
        let index;
        while ((index = scene_uuids.indexOf(uuid)) > -1) {
            scene_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Scenes', scene_uuids);

        this.server.sendBroadcast({
            type: 'remove-scene',
            uuid,
        }, this.ws);
    }

    @messagehandler('get-command-line-flags')
    async getCommandLineFlags(): Promise<ResponseMessages['get-command-line-flags']> {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Getting command line flags for', this.id);

        return process.argv;
    }

    @messagehandler('enable-proxy-stdout')
    async enableProxyStdout(): Promise<ResponseMessages['enable-proxy-stdout']> {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Enabling stdout proxy for', this.id);
        this.enable_proxy_stdout = true;

        setTimeout(() => this.log.info('Should work'), 1000);
    }

    @messagehandler('disable-proxy-stdout')
    async disableProxyStdout(): Promise<ResponseMessages['disable-proxy-stdout']> {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Disabling stdout proxy for', this.id);
        this.enable_proxy_stdout = false;
    }

    @messagehandler('get-system-information')
    async getSystemInformation(): Promise<ResponseMessages['get-system-information']> {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Getting system information');

        return SystemInformation.getSystemInformation();
    }

    @messagehandler('subscribe-system-information')
    async subscribeSystemInformation(): Promise<ResponseMessages['subscribe-system-information']> {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Subscribing to system information');

        SystemInformation.subscribe(this);
    }

    @messagehandler('unsubscribe-system-information')
    async unsubscribeSystemInformation(): Promise<ResponseMessages['unsubscribe-system-information']> {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Unsubscribing from system information');

        SystemInformation.unsubscribe(this);
    }

    /**
     * Gets the UUID of every bridge.
     */
    @messagehandler('list-bridges', data => [data.include_homebridge])
    async listBridges(include_homebridge = false): Promise<ResponseMessages['list-bridges']> {
        const uuids = [];

        for (const bridge of this.server.accessories.bridges) {
            if (!include_homebridge && bridge instanceof Homebridge) continue;

            uuids.push(bridge.uuid);
        }

        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    @messagehandler('create-bridges', data => data.data)
    createBridges(...data: any[]): Promise<ResponseMessages['create-bridges']> {
        return Promise.all(data.map(data => this.createBridge(data)));
    }

    async createBridge(data: any) {
        await this.permissions.assertCanCreateBridges();

        const uuid = genuuid();
        if (!data.username || !data.username.toLowerCase().match(/^([0-9a-f]{2}:){5}[0-9a-f]$/i)) {
            data.username = await genusername(this.server.storage);
        }

        this.log.debug('Creating bridge', uuid, data);
        await this.server.storage.setItem('Bridge.' + uuid, data);

        this.log.debug('Starting bridge', uuid);
        const bridge = await this.server.accessories.loadBridge(data, uuid);
        await bridge.publish();

        const bridge_uuids = await this.server.storage.getItem('Bridges') || [];
        if (!bridge_uuids.includes(uuid)) {
            bridge_uuids.push(uuid);
            await this.server.storage.setItem('Bridges', bridge_uuids);
        }

        this.server.sendBroadcast({
            type: 'add-accessories',
            ids: [uuid],
        }, this.ws);

        return uuid;
    }

    /**
     * Gets the details of a bridge.
     */
    @messagehandler('get-bridges', data => data.uuid)
    getBridges(...uuid: string[]): Promise<ResponseMessages['get-bridges']> {
        return Promise.all(uuid.map(uuid => this.getBridge(uuid)));
    }

    async getBridge(uuid: string) {
        await this.permissions.assertCanGetAccessory(uuid);
        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();

        const bridge = this.server.accessories.bridges.find(bridge => bridge.uuid === uuid);
        this.log.debug('Getting bridge info', uuid);
        if (!bridge) return null!;

        const bridge_details = {
            uuid,
            accessory_uuids: [] as string[],
        };

        for (const accessory of bridge.bridge.bridgedAccessories) {
            if (!authorised_uuids.includes(accessory.UUID)) continue;
            bridge_details.accessory_uuids.push(accessory.UUID);
        }

        return bridge_details;
    }

    /**
     * Gets the configuration of a bridge.
     */
    @messagehandler('get-bridges-configuration', data => data.uuid)
    getBridgesConfiguration(...uuid: string[]): Promise<ResponseMessages['get-bridges-configuration']> {
        return Promise.all(uuid.map(uuid => this.getBridgeConfiguration(uuid)));
    }

    async getBridgeConfiguration(uuid: string) {
        await this.permissions.assertCanGetAccessory(uuid);
        await this.permissions.assertCanGetBridgeConfiguration(uuid);

        this.log.debug('Getting bridge configuration', uuid);

        const bridge = this.server.accessories.bridges.find(b => b.uuid === uuid);
        if (bridge) return bridge.config;

        return this.server.storage.getItem('Bridge.' + uuid) || {};
    }

    /**
     * Gets the user's permissions for a bridge.
     */
    @messagehandler('get-bridges-permissions', data => data.uuid)
    getBridgesConfigurationPermissions(...uuid: string[]): Promise<ResponseMessages['get-bridges-permissions']> {
        return Promise.all(uuid.map(uuid => this.getBridgeConfigurationPermissions(uuid)));
    }

    async getBridgeConfigurationPermissions(uuid: string): Promise<ResponseMessages['get-bridges-permissions'][0]> {
        const is_from_config = !await this.server.storage.getItem('Bridge.' + uuid);

        const [get, set, del] = await Promise.all([
            this.permissions.checkCanGetBridgeConfiguration(uuid),
            this.permissions.checkCanSetBridgeConfiguration(uuid),
            this.permissions.checkCanDeleteBridge(uuid),
        ]);

        return {
            get: get!, set: set!, delete: del!,
            is_from_config: is_from_config ||
                (this.server.accessories.homebridge && this.server.accessories.homebridge.uuid === uuid)!,
        };
    }

    /**
     * Sets the configuration of a bridge.
     */
    @messagehandler('set-bridges-configuration', data => data.uuid_data)
    setBridgesConfiguration(...uuid_data: [string, any][]): Promise<ResponseMessages['set-bridges-configuration']> {
        return Promise.all(uuid_data.map(([uuid, data]) => this.setBridgeConfiguration(uuid, data)));
    }

    async setBridgeConfiguration(uuid: string, data: any) {
        await this.permissions.assertCanSetBridgeConfiguration(uuid);

        const is_from_config = !await this.server.storage.getItem('Bridge.' + uuid);
        if (is_from_config) throw new Error('Cannot update bridges not created in the web interface');

        if (!data.username || !data.username.toLowerCase().match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) {
            data.username = await genusername(this.server.storage);
        }

        const bridge = this.server.accessories.bridges.find(b => b.uuid === uuid);
        if (!bridge) throw new Error('Unknown bridge');

        if (!isEqual(
            Object.assign({}, {accessories: undefined}, data, {accessories: undefined}),
            Object.assign({}, {accessories: undefined}, bridge.config, {accessories: undefined})
        )) {
            this.log.debug('Stopping bridge', uuid);
            await this.server.accessories.unloadBridge(uuid);

            this.log.debug('Setting bridge configuration', uuid, data);
            await this.server.storage.setItem('Bridge.' + uuid, data);

            this.log.debug('Starting bridge', uuid);
            const bridge = await this.server.accessories.loadBridge(data, uuid);
            await bridge.publish();
        } else {
            this.log.debug('Setting bridge configuration', uuid, bridge.config, data);
            await this.server.storage.setItem('Bridge.' + uuid, data);

            // If only the accessories have changed then update the existing bridge's accessories

            const old_accessories = bridge.config.accessories || [];
            const new_accessories = data.accessories || [];
            const added_accessories = new_accessories.filter((u: string) => !old_accessories.includes(u));
            const removed_accessories = old_accessories.filter((u: string) => !new_accessories.includes(u));

            bridge.config = data;
            bridge.accessory_uuids = data.accessories || [];

            this.log.debug('Updating accessories', added_accessories, removed_accessories);

            bridge.patchAccessories(
                added_accessories.map((u: string) => this.server.getAccessory(u)).filter((a: string) => a),
                removed_accessories.map((u: string) => this.server.getAccessory(u))
            );
        }

        const bridge_uuids = await this.server.storage.getItem('Bridges') || [];
        if (!bridge_uuids.includes(uuid)) {
            bridge_uuids.push(uuid);
            await this.server.storage.setItem('Bridges', bridge_uuids);
        }

        // this.server.sendBroadcast({
        //     type: 'update-bridge-configuration',
        //     uuid,
        //     data,
        // }, this.ws);
    }

    /**
     * Deletes a bridge.
     */
    @messagehandler('delete-bridges', data => data.uuid)
    deleteBridges(...uuid: string[]): Promise<ResponseMessages['delete-bridges']> {
        return Promise.all(uuid.map(uuid => this.deleteBridge(uuid)));
    }

    async deleteBridge(uuid: string) {
        await this.permissions.assertCanDeleteBridge(uuid);

        const is_from_config = !await this.server.storage.getItem('Bridge.' + uuid);
        if (is_from_config) throw new Error('Cannot delete bridges not created in the web interface');

        this.log.debug('Stopping bridge', uuid);
        await this.server.accessories.unloadBridge(uuid);

        this.log.debug('Deleting bridge', uuid);
        await this.server.storage.removeItem('Bridge.' + uuid);

        const bridge_uuids = await this.server.storage.getItem('Bridges') || [];
        let index;
        while ((index = bridge_uuids.indexOf(uuid)) > -1) {
            bridge_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Bridges', bridge_uuids);

        this.server.sendBroadcast({
            type: 'remove-accessories',
            ids: [uuid],
        }, this.ws);
    }

    /**
     * Get bridges pairing details.
     */
    @messagehandler('get-bridges-pairing-details', data => [data.bridge_uuid])
    getBridgesPairingDetails(...bridge_uuid: string[]): Promise<ResponseMessages['get-bridges-pairing-details']> {
        return Promise.all(bridge_uuid.map(bridge_uuid => this.getBridgePairingDetails(bridge_uuid)));
    }

    async getBridgePairingDetails(bridge_uuid: string) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.accessories.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null!;

        return {
            username: bridge.username,
            pincode: bridge.pincode,
            url: bridge.setup_uri,
        };
    }

    /**
     * Reset bridge pairings.
     */
    @messagehandler('reset-bridges-pairings', data => [data.bridge_uuid])
    resetBridgesPairings(...bridge_uuid: string[]): Promise<ResponseMessages['reset-bridges-pairings']> {
        return Promise.all(bridge_uuid.map(bridge_uuid => this.resetBridgePairings(bridge_uuid)));
    }

    async resetBridgePairings(bridge_uuid: string) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.accessories.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return;

        for (const pairing_id of Object.keys(bridge.accessory_info.pairedClients)) {
            delete bridge.accessory_info.pairedClients[pairing_id];
        }
        bridge.accessory_info.pairedAdminClients = 0;

        bridge.accessory_info.save();

        if (bridge.hasOwnProperty('hap_server')) {
            bridge.hap_server.updateAdvertisement();

            for (const connection of bridge.hap_server.connections) {
                connection.close();
            }
        }
    }

    /**
     * Lists pairings.
     */
    @messagehandler('list-pairings', data => [data.bridge_uuid])
    async listPairings(bridge_uuid: string): Promise<ResponseMessages['list-pairings']> {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.accessories.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null!;

        const ids = [];

        for (const pairing_id of Object.keys(bridge.accessory_info.pairedClients)) {
            ids.push(pairing_id);
        }

        return ids;
    }

    /**
     * Gets the details of pairings.
     */
    @messagehandler('get-pairings', data => data.ids)
    getPairings(...id: [string, string][]): Promise<ResponseMessages['get-pairings']> {
        return Promise.all(id.map(([bridge_uuid, id]) => this.getPairing(bridge_uuid, id)));
    }

    async getPairing(bridge_uuid: string, id: string) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.accessories.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null!;

        const pairing_info = bridge.accessory_info.pairedClients[id];
        if (!pairing_info) return null!;

        return {
            bridge_uuid,
            id,
            public_key: pairing_info.publicKey.toString('hex'),
            permissions: pairing_info.permission,
        };
    }

    /**
     * Gets the details of HAP pairings.
     * This is stored by the web interface.
     */
    @messagehandler('get-pairings-data', data => data.id)
    getPairingsData(...id: string[]): Promise<ResponseMessages['get-pairings-data']> {
        return Promise.all(id.map(id => this.getPairingData(id)));
    }

    async getPairingData(id: string) {
        // await this.permissions.assertCanAccessServerRuntimeInfo();
        await this.permissions.assertCanGetPairing(id);

        this.log.debug('Getting data for pairing', id);

        return await this.server.storage.getItem('Pairing.' + id) || {};
    }

    /**
     * Gets the user's permissions for HAP pairings.
     * This is stored by the web interface.
     */
    @messagehandler('get-pairings-permissions', data => data.id)
    getPairingsPermissions(...id: string[]): Promise<ResponseMessages['get-pairings-permissions']> {
        return Promise.all(id.map(id => this.getPairingPermissions(id)));
    }

    async getPairingPermissions(id: string) {
        // eslint-disable-next-line no-unused-vars, array-bracket-spacing
        const [get, set /* , info */] = await Promise.all([
            this.permissions.checkCanGetPairing(id),
            this.permissions.checkCanSetPairing(id),
            // this.permissions.checkCanAccessServerRuntimeInfo(),
        ]);

        return {
            get: get, // && info,
            set: set, // && info,
        };
    }

    /**
     * Sets extra data of HAP pairings.
     * This is stored by the web interface.
     */
    @messagehandler('set-pairings-data', data => data.id_data)
    setPairingsData(...id_data: [string, any][]): Promise<ResponseMessages['set-pairings-data']> {
        return Promise.all(id_data.map(([id, data]) => this.setPairingData(id, data)));
    }

    async setPairingData(id: string, data: any) {
        // await this.permissions.assertCanAccessServerRuntimeInfo();
        await this.permissions.assertCanSetPairing(id);

        this.log.debug('Setting data for pairing', id, data);

        await this.server.storage.setItem('Pairing.' + id, data);

        this.server.sendBroadcast({
            type: 'update-pairing-data',
            id,
            data,
        }, this.ws);
    }

    /**
     * Gets web interface plugins.
     */
    @messagehandler('get-web-interface-plugins')
    async getWebInterfacePlugins(): Promise<ResponseMessages['get-web-interface-plugins']> {
        return PluginManager.getWebInterfacePlugins().map(ui_plugin => {
            const plugin_authentication_handlers: {[localid: string]: number} = {};
            for (const [localid, authentication_handler] of ui_plugin.plugin.authentication_handlers.entries()) {
                plugin_authentication_handlers[localid] = authentication_handler.id;
            }

            const plugin_user_management_handlers: {[localid: string]: number} = {};
            for (const [localid, user_management_handler] of ui_plugin.plugin.user_management_handlers.entries()) {
                plugin_user_management_handlers[localid] = user_management_handler.id;
            }

            const plugin_accessory_discovery_handlers: {[localid: string]: number} = {};
            const plugin_accessory_discovery_handler_setup_handlers: {[localid: string]: number} = {};
            for (const [localid, accessory_discovery] of ui_plugin.plugin.accessory_discovery.entries()) {
                plugin_accessory_discovery_handlers[localid] = accessory_discovery.id;
                plugin_accessory_discovery_handler_setup_handlers[localid] = accessory_discovery.setup.id;
            }

            const plugin_accessory_setup_handlers: {[localid: string]: number} = {};
            for (const [localid, accessory_setup] of ui_plugin.plugin.accessory_setup.entries()) {
                plugin_accessory_setup_handlers[localid] = accessory_setup.id;
            }

            return {
                id: ui_plugin.id,
                scripts: ui_plugin.scripts,

                plugin: ui_plugin.plugin.name,
                plugin_authentication_handlers,
                plugin_user_management_handlers,
                plugin_accessory_discovery_handlers,
                plugin_accessory_discovery_handler_setup_handlers,
                plugin_accessory_setup_handlers,
            };
        });
    }

    async handleAuthenticateMessage(messageid: number, data: AuthenticateRequestMessage) {
        try {
            if ('authentication_handler_id' in data && typeof data.authentication_handler_id === 'number') {
                if (!await this.server.storage.getItem('HasCompletedSetup')) {
                    await this.server.storage.setItem('HasCompletedSetup', true);
                }

                const id = data.authentication_handler_id;
                const authentication_handler = PluginManager.getAuthenticationHandler(id);

                const logdata = Object.assign({}, data.data);
                for (const k of hide_authentication_keys) if (logdata.hasOwnProperty(k)) logdata[k] = null;

                this.log.debug('Received authenticate message', messageid, logdata, authentication_handler);

                if (!authentication_handler) {
                    throw new Error('Unknown authentication handler');
                }

                const response = await authentication_handler.handleMessage(data.data, this);

                await this.sendAuthenticateResponse(messageid, response);
            } else if ('token' in data && typeof data.token === 'string') {
                if (!await this.server.storage.getItem('HasCompletedSetup')) {
                    await this.server.storage.setItem('HasCompletedSetup', true);
                }

                const token = data.token;

                this.log.info('Resuming session');

                const session = await this.server.storage.getItem('Session.' + token);
                if (!session) throw new Error('Invalid session');

                const plugin = PluginManager.getPlugin(session.authentication_handler_plugin);
                if (!plugin) throw new Error('Unknown authentication handler');

                const authentication_handler = plugin.getAuthenticationHandler(session.authentication_handler);
                if (!authentication_handler) throw new Error('Unknown authentication handler');

                const authenticated_user = await authentication_handler.handleResumeSession(token,
                    session.authenticated_user, this);

                await this.sendAuthenticateResponse(messageid, authenticated_user);
            } else if ('cli_token' in data && typeof data.cli_token === 'string') {
                const token = data.cli_token;

                this.log.info('Authenticating with CLI token');

                if (!this.server.cli_auth_token || this.server.cli_auth_token !== token) {
                    throw new Error('Invalid token');
                }

                this.authenticated_user = new AuthenticatedUser(null, 'cli-token', 'Admin');

                return this.respond(messageid, {
                    success: true,
                    data: this.authenticated_user,
                    user_id: this.authenticated_user.id,
                });
            } else if ('setup_token' in data && typeof data.setup_token === 'string') {
                const token = data.setup_token.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z ]/g, '');

                this.log.info('Authenticating with setup token', token);

                if ([...this.server.wss.clients]
                    .map(s => (this.constructor as typeof Connection).getConnectionForWebSocket(s))
                    .find(c => c && c.authenticated_user && c.authenticated_user.id === 'cli-token')
                ) {
                    throw new Error('Another client is authenticated as the setup user.');
                }

                if (await this.server.storage.getItem('HasCompletedSetup')) {
                    throw new Error('Setup has already been completed.');
                }

                // @ts-ignore
                if (!this.server.setup_token || this.server.setup_token.join(' ') !== token) {
                    throw new Error('Invalid token.');
                }

                this.authenticated_user = new AuthenticatedUser(null, 'cli-token', 'Setup user');

                return this.respond(messageid, {
                    success: true,
                    data: this.authenticated_user,
                    user_id: this.authenticated_user!.id,
                });
            } else {
                throw new Error('Unknown authentication handler');
            }
        } catch (err) {
            this.log.error('Error authenticating', err);

            this.respond(messageid, {
                error: err instanceof Error,
                constructor: err.constructor.name,
                data: err instanceof Error ? {message: err.message, code: (err as any).code, stack: err.stack} : err,
            }, true);
        }
    }

    async sendAuthenticateResponse(messageid: number, response: AuthenticatedUser | ResponseMessages['authenticate']) {
        if (response instanceof AuthenticatedUser) {
            if (response.token) {
                // Save the authenticated user to the session
                await this.server.storage.setItem('Session.' + response.token, {
                    authentication_handler: response.authentication_handler.localid,
                    authentication_handler_plugin: response.authentication_handler.plugin.name,
                    authenticated_user: Object.assign({}, response, {id: response.id}),
                });
            }

            try {
                if (this.authenticated_user) {
                    this.authenticated_user.authentication_handler.handleReauthenticate(this.authenticated_user, this);
                }
            } catch (err) {
                this.log.error('Error in reauthenticate handler', err);
            }

            this.authenticated_user = response;

            return this.respond(messageid, {
                success: true,
                data: response,
                user_id: response.id,
                token: response.token,
                // @ts-ignore
                authentication_handler_id: response.authentication_handler_id, // what
                asset_token: await this.getAssetToken(),
            });
        }

        return this.respond(messageid, {
            success: false,
            data: response,
        });
    }

    async handleUserManagementMessage(messageid: number, data: UserManagementRequestMessage) {
        try {
            await this.permissions.assertCanManageUsers();

            const id = data.user_management_handler_id;
            const user_management_handler = PluginManager.getUserManagementHandler(id);

            this.log.debug('Received user management message', messageid, data, user_management_handler);

            if (!user_management_handler) {
                throw new Error('Unknown user management handler');
            }

            const response = await user_management_handler.handleMessage(data.data, this);

            return this.respond(messageid, response);
        } catch (err) {
            this.log.error('Error in user management handler', err);

            this.respond(messageid, {
                error: err instanceof Error,
                constructor: err.constructor.name,
                data: err instanceof Error ? {message: err.message, code: (err as any).code, stack: err.stack} : err,
            }, true);
        }
    }

    /**
     * Gets user permissions.
     */
    @messagehandler('get-users-permissions', data => data.id)
    async getUsersPermissions(...id: string[]): Promise<ResponseMessages['get-users-permissions']> {
        return Promise.all(id.map(id => this.getUserPermissions(id)));
    }

    async getUserPermissions(user_id: string) {
        await this.permissions.assertCanManageUsers();
        await this.permissions.assertCanManagePermissions();

        return this.server.storage.getItem('Permissions.' + user_id);
    }

    /**
     * Sets user permissions.
     */
    @messagehandler('set-users-permissions', data => data.id_data)
    async setUsersPermissions(...id_data: [string, any][]): Promise<ResponseMessages['set-users-permissions']> {
        return Promise.all(id_data.map(([id, data]) => this.setUserPermissions(id, data)));
    }

    async setUserPermissions(user_id: string, data: any) {
        await this.permissions.assertCanManageUsers();
        await this.permissions.assertCanManagePermissions();

        await this.server.storage.setItem('Permissions.' + user_id, data);

        for (const ws of this.server.wss.clients) {
            const connection = Connection.getConnectionForWebSocket(ws);
            if (!connection) continue;

            if (ws.readyState !== WebSocket.OPEN || !connection.authenticated_user ||
                connection.authenticated_user.id !== user_id
            ) continue;

            // Clear the cached permissions
            // @ts-ignore
            delete connection.permissions.permissions;

            connection.sendBroadcast({
                type: 'update-permissions',
                data: await connection.getHomePermissions(),
            });
        }
    }

    async handleAccessorySetupMessage(messageid: number, data: any) {
        try {
            await this.permissions.assertCanCreateAccessories();

            const accessory_setup = PluginManager.getAccessorySetupHandler(data.accessory_setup_id);

            this.log.info('Received accessory setup message', messageid, data, accessory_setup);

            if (!accessory_setup) {
                throw new Error('Unknown accessory setup handler');
            }

            const response = await accessory_setup.handleMessage(data.data, this);

            return this.respond(messageid, response);
        } catch (err) {
            this.log.error('Error in accessory setup handler', err);

            this.respond(messageid, {
                error: err instanceof Error,
                constructor: err.constructor.name,
                data: err instanceof Error ? {message: err.message, code: (err as any).code, stack: err.stack} : err,
            }, true);
        }
    }

    @messagehandler('open-console')
    async openConsole(): Promise<ResponseMessages['open-console']> {
        await this.permissions.assertCanOpenWebConsole();

        const id = this.console_id++;

        const input = new stream.Readable({
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            read: () => {},
        });
        const output = new stream.Writable({
            write: (data, encoding, callback) => {
                this.sendBroadcast({
                    type: 'console-output',
                    id,
                    stream: 'out',
                    data: data.toString('utf-8'),
                });
                callback();
            },
        });

        const console = {input, output, subprocesses: new Set(), repl_server: null as repl.REPLServer | null};
        this.open_consoles.set(id, console);

        setTimeout(() => {
            const repl_server = repl.start({
                input,
                output,
                terminal: true,
                useColors: true,
            });

            repl_server.context.PluginManager = PluginManager;
            repl_server.context.server = this.server;
            repl_server.context.connection = this;

            repl_server.on('reset', () => {
                repl_server.context.PluginManager = PluginManager;
                repl_server.context.server = this.server;
                repl_server.context.connection = this;
            });

            repl_server.defineCommand('exec', {
                help: 'Execute a command on the host',
                action: async command => {
                    if (!command) {
                        repl_server.clearBufferedCommand();
                        output.write(chalk.red('Must provide a command to run') + '\n');
                        repl_server.displayPrompt();
                        return;
                    }

                    this.log.info('Running command %s', command);
                    repl_server.clearBufferedCommand();
                    repl_server.pause();
                    const subprocess = child_process.exec(command);
                    console.subprocesses.add(subprocess);
                    subprocess.stdout!.on('data', data => output.write(data));
                    subprocess.stderr!.on('data', data => output.write(data));
                    console.input = subprocess.stdin as any;
                    const {code, signal} = await new Promise(rs =>
                        subprocess.on('exit', (code, signal) => rs({code, signal})));
                    console.input = input;
                    console.subprocesses.delete(subprocess);
                    repl_server.resume();
                    this.log.info('Command %s exited with %s %d',
                        command, signal ? 'signal' : 'code', signal ? signal : code);
                    if (signal) output.write(chalk.yellow('Killed with signal ' + signal) + '\n');
                    else output.write(chalk[code === 0 ? 'grey' : 'red']('Exit code ' + code) + '\n');
                    repl_server.displayPrompt();
                },
            });

            console.repl_server = repl_server;
        }, 0);

        return id;
    }

    @messagehandler('close-console', data => [data.id])
    async closeConsole(id: number): Promise<ResponseMessages['close-console']> {
        const {repl_server, subprocesses} = this.open_consoles.get(id) || {};
        if (!repl_server) throw new Error('Unknown console with ID "' + id + '"');

        repl_server.close();
        this.open_consoles.delete(id);

        for (const subprocess of subprocesses) {
            subprocess.kill();
        }
    }

    @messagehandler('console-input', data => [data.id, data.data])
    async handleConsoleInput(id: number, data: string): Promise<ResponseMessages['console-input']> {
        const {repl_server, input} = this.open_consoles.get(id) || {};
        if (!repl_server) throw new Error('Unknown console with ID "' + id + '"');

        if (input.writable) input.write(data, 'utf-8');
        else input.push(data, 'utf-8');
    }
}

export const ConnectionSymbol = Symbol('Connection');

if (DEVELOPMENT) {
    const development_data = exports.development_data = {
        vue_devtools_host: '127.0.0.1',
        vue_devtools_port: 0,
    };

    message_methods['development-data'] = 'handleDevelopmentDataMessage';

    (Connection as any).prototype.handleDevelopmentDataMessage = function(this: Connection, messageid: number) {
        this.respond(messageid, development_data);
    };

    exports.enableVueDevtools = function(host: string, port: number) {
        development_data.vue_devtools_host = host;
        development_data.vue_devtools_port = port;
    };
}
