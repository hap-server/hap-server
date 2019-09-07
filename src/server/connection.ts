
/* eslint valid-jsdoc: 'off' */

import process from 'process';
import crypto from 'crypto';
import path from 'path';
import url from 'url';
import querystring from 'querystring';
import fs from 'fs';
import util from 'util';
import stream from 'stream';
import repl from 'repl';
import child_process from 'child_process';
import genuuid from 'uuid/v4';
import mkdirp from 'mkdirp';
import chalk from 'chalk';

import hap from 'hap-nodejs';

import isEqual from 'lodash.isequal';

import PluginManager, {AuthenticatedUser} from './plugins';
import Homebridge from './homebridge';
import Permissions from './permissions';
import {hapStatus} from './hap-server';

const randomBytes = util.promisify(crypto.randomBytes);

/**
 * Get/generate an Organisationally Unique Identifier for generating MAC addresses.
 *
 * @param {node-persist} storage
 * @return {Promise<Buffer>}
 */
async function getoui(storage) {
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
 * @param {node-persist} storage
 * @return {Promise<string>}
 */
async function genusername(storage) {
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

const message_methods = {
    'authenticate': 'handleAuthenticateMessage',
    'user-management': 'handleUserManagementMessage',
    'accessory-setup': 'handleAccessorySetupMessage',
};

const message_handlers = {
    'get-accessory-uis': 'getWebInterfacePlugins', // deprecated
};

const hide_authentication_keys = [
    'password', 'token',
];

function messagehandler(type, handler?) {
    return messagehandler2.bind(null, type, handler);
}
function messagehandler2(type: string, handler: (messageid: number, data) => void, target: Connection, method: string) {
    if (handler) {
        const key = '_handleMessage-' + type + '-' + method;
        target[key] = function(messageid, data) {
            return this.respond(messageid, this[method].apply(this, handler.call(this, data)));
        };
        message_methods[type] = key;
    } else {
        message_handlers[type] = method;
    }
}

const ws_map = new WeakMap();

const DEVELOPMENT = true;

import Server from './server';
import Logger from '../common/logger';
import WebSocket from 'ws';
import http from 'http';

export default class Connection {
    readonly server: Server;
    readonly ws: WebSocket;
    readonly id: number;
    readonly log: Logger;
    authenticated_user?: AuthenticatedUser;
    enable_accessory_discovery = false;
    enable_proxy_stdout = false;
    last_message?: number;
    closed = false;
    readonly req: http.IncomingMessage;
    readonly uploads;
    readonly open_consoles: Map<any, any>;
    console_id: number;
    readonly events: Set<any>;

    readonly permissions: Permissions;

    terminateInterval;

    asset_token: string;

    constructor(server: Server, ws: WebSocket, req: http.IncomingMessage) {
        Object.defineProperty(this, 'server', {value: server});
        Object.defineProperty(this, 'ws', {value: ws});
        Object.defineProperty(this, 'id', {enumerable: true, value: id++});
        Object.defineProperty(this, 'log', {value: server.log.withPrefix('Connection #' + this.id)});
        this.authenticated_user = null;
        this.enable_accessory_discovery = false;
        this.enable_proxy_stdout = false;
        this.last_message = null;
        this.closed = false;
        Object.defineProperty(this, 'req', {value: req});
        this.uploads = [];
        this.open_consoles = new Map();
        this.console_id = 0;
        this.events = new Set(); // Characteristics the client has subscribed to updates for

        this.permissions = new Permissions(this);

        this.log.info('WebSocket connection from', this.req.connection.remoteAddress);
        // this.server.log.debug('WebSocket connection', this.id, this.ws);

        ws_map.set(this.ws, this);

        ws.on('message', message => {
            if (this.closed) {
                this.log.warning('Received message from closed connection...!?');
                this.ws.close();
                return;
            }

            this.last_message = Date.now();

            // this.server.log.debug('Received', this.id, message);

            if (message === 'pong') {
                this.log.info('Received ping response');
                return;
            }

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
                    this.authenticated_user.authentication_handler.handleDisconnect(this.authenticated_user);
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

            await Promise.all(this.uploads.map(file => new Promise((rs, rj) =>
                fs.unlink(file.filepath, err => err ? rj(err) : rs()))));
        });

        // ws.send('ping');
        ws.ping();
        ws.on('pong', () => this.last_message = Date.now());

        this.terminateInterval = setInterval(() => {
            this.ws.ping();

            // A message was received less than 30 seconds ago
            if (this.last_message > Date.now() - 30000) return;

            this.ws.terminate();
        }, 15000);
    }

    static getConnectionForWebSocket(ws) {
        return ws_map.get(ws);
    }

    sendBroadcast(data) {
        this.ws.send('**:' + JSON.stringify(data));
    }

    async respond(messageid: number, data, error?) {
        if (data instanceof Promise) {
            try {
                error = false;
                data = await data;
            } catch (err) {
                this.log.error('Error in message handler', data.type, err);

                error = true;
                data = {
                    reject: true,
                    error: err instanceof Error,
                    constructor: err.constructor.name,
                    data: err ? Object.assign({message: err.message, code: err.code, stack: err.stack}, err) : err,
                };
            }
        }

        this.ws.send((error ? '!' : '*') + messageid + ':' + JSON.stringify(data));
    }

    sendProgress(messageid, data) {
        this.ws.send('&' + messageid + ':' + JSON.stringify(data));
    }

    handleMessage(messageid, data) {
        // this.server.log.debug('Received message', data, 'from', this.id, 'with messageid', messageid);

        if (data === 'ping') {
            this.respond(messageid, 'pong');
            return;
        }

        try {
            if (data && data.type && message_methods[data.type]) {
                this[message_methods[data.type]].call(this, messageid, data);
            } else if (data && data.type && typeof message_handlers[data.type] === 'string') {
                this.respond(messageid, this[message_handlers[data.type]].call(this, data));
            } else if (data && data.type && typeof message_handlers[data.type] === 'function') {
                this.respond(messageid, message_handlers[data.type].call(this, data, this));
            }
        } catch (err) {
            this.log.error('Error in message handler', data.type, err);
        }
    }

    async getAssetToken() {
        if (this.asset_token) return this.asset_token;

        const bytes = await randomBytes(48);
        const token = bytes.toString('hex');

        this.log.info('Asset token', token);

        return this.asset_token = token;
    }

    static authoriseAssetRequest(server, req, res, next) {
        const {search} = url.parse(req.url);
        const search_params = querystring.parse(search);
        const asset_token = search_params.token || req.cookies.asset_token;

        const connection = [...server.wss.clients].map(s => this.getConnectionForWebSocket(s))
            .find(c => c.asset_token === asset_token);

        if (!asset_token || !connection) {
            server.log('Unauthorised asset request', req.url);

            res.statusCode = 401;
            res.send('Unauthorised');

            return;
        }

        connection.log('Authenticated asset request', req.url);

        req.hap_server_connection = connection;

        next();
    }

    /**
     * Gets the UUID of every accessory.
     */
    @messagehandler('list-accessories')
    async listAccessories() {
        const uuids = [];

        for (const bridge of this.server.bridges) {
            uuids.push(bridge.uuid);
        }

        for (const accessory of this.server.accessories) {
            uuids.push(accessory.uuid);
        }

        for (const accessory of this.server.cached_accessories) {
            uuids.push(accessory.uuid);
        }

        for (const bridge of this.server.bridges) {
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
    getAccessories(...id) {
        return Promise.all(id.map(id => this.getAccessory(id)));
    }

    async getAccessory(uuid) {
        await this.permissions.assertCanGetAccessory(uuid);

        const accessory = this.server.getAccessory(uuid);

        if (!accessory) return null;

        const hap = accessory.toHAP()[0];

        // Add service subtypes
        // eslint-disable-next-line guard-for-in
        for (const index in accessory.services) {
            const service = accessory.services[index];
            const service_hap = hap.services[index];

            service_hap.subtype = service.subtype;
        }

        return hap;
    }

    /**
     * Gets the user's permissions for accessories.
     */
    @messagehandler('get-accessories-permissions', data => data.id)
    getAccessoriesPermissions(...id) {
        return Promise.all(id.map(id => this.getAccessoryPermissions(id)));
    }

    async getAccessoryPermissions(uuid) {
        const accessory = this.server.getAccessory(uuid);

        if (!accessory) return;

        const [get, set, set_characteristics] = await Promise.all([
            this.permissions.checkCanGetAccessory(uuid),
            this.permissions.checkCanSetAccessoryData(uuid),

            this.getCharacteristicsWithSetPermission(accessory),
        ]);

        return {get, set, set_characteristics};
    }

    async getCharacteristicsWithSetPermission(accessory) {
        const services = {};

        await Promise.all(accessory.services.map(async service => {
            const characteristics = [];
            await Promise.all(service.characteristics.map(async characteristic => {
                if (await this.permissions.checkCanSetCharacteristic(accessory.UUID, service.UUID,
                    characteristic.UUID)) characteristics.push(characteristic.UUID);
            }));
            if (characteristics.length) services[service.UUID + (service.subtype ? '.' + service.subtype : '')] = characteristics;
        }));

        // await Promise.all(service.characteristics.map(async characteristic => this.permissions.checkCanSetCharacteristic(uuid, service.UUID, characteristic.UUID).then(can_set => can_set ? characteristic.UUID)))

        return services;
    }

    /**
     * Gets the value of a characteristic.
     */
    @messagehandler('get-characteristics', data => data.ids)
    getCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.getCharacteristic(ids[0], ids[1], ids[2])));
    }

    async getCharacteristic(accessory_uuid, service_uuid, characteristic_uuid) {
        await this.permissions.assertCanGetAccessory(accessory_uuid);

        const accessory = this.server.getAccessory(accessory_uuid);

        const service_type = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
        const service_subtype = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(service_uuid.indexOf('.') + 1) : undefined;

        const service = accessory.services.find(service => service.UUID === service_type &&
            ((!service.subtype && !service_subtype) || service.subtype === service_subtype));
        if (!service) return;

        const characteristic = service.characteristics.find(c => c.UUID === characteristic_uuid);
        if (!characteristic) return;

        const hap = characteristic.toHAP();

        try {
            hap.value = await new Promise((resolve, reject) => {
                characteristic.getValue((err, value) => err ? reject(err) : resolve(value));
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
    setCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.setCharacteristic(ids[0], ids[1], ids[2], ids[3])));
    }

    async setCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        await this.permissions.assertCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value);

        // this.log.info('Setting characteristic', accessory_uuid, service_uuid, characteristic_uuid, 'to', value);

        const accessory = this.server.getAccessory(accessory_uuid);
        if (!accessory) return this.log.warn('Unknown accessory %s', accessory_uuid);

        const service_type = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
        const service_subtype = service_uuid.indexOf('.') !== -1 ?
            service_uuid.substr(service_uuid.indexOf('.') + 1) : undefined;

        const service = accessory.services.find(service => service.UUID === service_type &&
            ((!service.subtype && !service_subtype) || service.subtype === service_subtype));
        if (!service) return this.log.warn('Unknown service %s', service_uuid);

        const characteristic = service.characteristics.find(c => c.UUID === characteristic_uuid);
        if (!characteristic) return this.log.warn('Unknown characteristic %s', characteristic_uuid);

        return new Promise((resolve, reject) => {
            characteristic.setValue(value, (err, r) => err ? reject(err) : resolve(r));
        });
    }

    /**
     * Subscribes to characteristic updates.
     */
    @messagehandler('subscribe-characteristics', data => data.ids)
    subscribeCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.subscribeCharacteristic(ids[0], ids[1], ids[2])));
    }

    async subscribeCharacteristic(accessory_uuid, service_uuid, characteristic_uuid) {
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

        const characteristic = service.characteristics.find(c => c.UUID === characteristic_uuid);
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
    unsubscribeCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.unsubscribeCharacteristic(ids[0], ids[1], ids[2])));
    }

    async unsubscribeCharacteristic(accessory_uuid, service_uuid, characteristic_uuid) {
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

        const characteristic = service.characteristics.find(c => c.UUID === characteristic_uuid);
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
     * Gets the details of accessories.
     * This is stored by the web UI.
     */
    @messagehandler('get-accessories-data', data => data.id)
    getAccessoriesData(...id) {
        return Promise.all(id.map(id => this.getAccessoryData(id)));
    }

    async getAccessoryData(id) {
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
    setAccessoriesData(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setAccessoryData(id, data)));
    }

    async setAccessoryData(uuid, data) {
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
    async startAccessoryDiscovery() {
        await this.permissions.assertCanCreateAccessories();

        if (!this.enable_accessory_discovery) {
            this.enable_accessory_discovery = true;
            this.server.incrementAccessoryDiscoveryCounter();
        }

        return this.getDiscoveredAccessories();
    }

    /**
     * Gets discovered accessories.
     */
    @messagehandler('get-discovered-accessories')
    async getDiscoveredAccessories() {
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
    async stopAccessoryDiscovery() {
        await this.permissions.assertCanCreateAccessories();

        if (!this.enable_accessory_discovery) return;

        this.enable_accessory_discovery = false;
        this.server.decrementAccessoryDiscoveryCounter();
    }

    /**
     * Gets global settings.
     */
    @messagehandler('get-home-settings')
    async getHomeSettings() {
        await this.permissions.assertCanGetHomeSettings();

        this.log.debug('Getting global settings');

        return await this.server.storage.getItem('Home') || {};
    }

    /**
     * Gets the user's global permissions.
     */
    @messagehandler('get-home-permissions')
    async getHomePermissions() {
        const [
            get, set, add_accessories, create_layouts, has_automations, create_automations, create_bridges,
            server, users, permissions, console,
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
            this.permissions.checkCanOpenWebConsole(),
        ]);

        return {
            get, set, add_accessories, create_layouts, has_automations, create_automations, create_bridges,
            server, users, permissions, console,
        };
    }

    /**
     * Sets global settings.
     */
    @messagehandler('set-home-settings', data => [data.data])
    async setHomeSettings(data) {
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
            await new Promise((rs, rj) => fs.unlink(path.join(this.server.assets_path, previous_data.background_url),
                err => err ? rj(err) : rs()));
        }
    }

    /**
     * Gets the UUID of every layout.
     */
    @messagehandler('list-layouts')
    async listLayouts() {
        const uuids = [].concat(await this.server.storage.getItem('Layouts'));

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
    createLayouts(...data) {
        return Promise.all(data.map(data => this.createLayout(data)));
    }

    async createLayout(data) {
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
            type: 'new-layout',
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of layouts.
     */
    @messagehandler('get-layouts', data => data.id)
    getLayouts(...id) {
        return Promise.all(id.map(id => this.getLayout(id)));
    }

    async getLayout(id) {
        await this.permissions.assertCanGetLayout(id);

        this.log.debug('Getting data for layout', id);

        return await this.server.storage.getItem('Layout.' + id) || {};
    }

    /**
     * Gets the user's permissions for layouts.
     */
    @messagehandler('get-layouts-permissions', data => data.id)
    getLayoutsPermissions(...id) {
        return Promise.all(id.map(id => this.getLayoutPermissions(id)));
    }

    async getLayoutPermissions(uuid) {
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
    setLayouts(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setLayout(id, data)));
    }

    async setLayout(uuid, data) {
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
            await new Promise((rs, rj) => fs.unlink(path.join(this.server.assets_path, previous_data.background_url),
                err => err ? rj(err) : rs()));
        }
    }

    /**
     * Handle layout background uploads.
     * This does not happen over the WebSocket.
     *
     * The user will have already authenticated with an asset token.
     */
    static async handleUploadLayoutBackground(server, req, res) {
        const connection = req.hap_server_connection;

        try {
            const response = await connection.handleUploadLayoutBackground(req, res);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(response));
        } catch (err) {
            connection.log.error('Error uploading layout background', err);

            await new Promise((rs, rj) => fs.unlink(req.file.path, err => err ? rj(err) : rs()));

            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Error');
        }
    }

    async handleUploadLayoutBackground(req, res) {
        this.log(req.file);

        const stream = fs.createReadStream(req.file.path);
        const hash = crypto.createHash('sha1');
        hash.setEncoding('hex');

        stream.pipe(hash);

        const filehash = await new Promise((resolve, reject) => {
            stream.on('error', err => reject(err));
            stream.on('end', () => {
                hash.end();
                resolve(hash.read());
            });
        });

        const filename = filehash + path.extname(req.file.originalname);
        const filepath = path.join(this.server.assets_path, filename);

        if (await new Promise((rs, rj) => fs.stat(filepath, (err, stat) => err ? rs(false) : rs(true)))) {
            await new Promise((rs, rj) => fs.unlink(req.file.path, err => err ? rj(err) : rs()));

            return {
                name: filename,
            };
        }

        await new Promise((rs, rj) => mkdirp(this.server.assets_path, err => err ? rj(err) : rs()));
        await new Promise((rs, rj) => fs.rename(req.file.path, filepath, err => err ? rj(err) : rs()));

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
    deleteLayouts(...id) {
        return Promise.all(id.map(id => this.deleteLayout(id)));
    }

    async deleteLayout(uuid) {
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
            await new Promise((rs, rj) => fs.unlink(path.join(this.server.assets_path, data.background_url),
                err => err ? rj(err) : rs()));
        }
    }

    /**
     * Gets the UUID of every layout section.
     */
    @messagehandler('list-layout-sections', data => data.id)
    listAllLayoutSections(...id) {
        return Promise.all(id.map(id => this.listLayoutSections(id)));
    }

    async listLayoutSections(uuid) {
        await this.permissions.assertCanGetLayout(uuid);

        return await this.server.storage.getItem('LayoutSections.' + uuid) || [];
    }

    /**
     * Creates layout sections.
     */
    @messagehandler('create-layout-sections', data => data.id_data)
    createLayoutSections(...id_data) {
        return Promise.all(id_data.map(([layout_uuid, data]) => this.createLayoutSection(layout_uuid, data)));
    }

    async createLayoutSection(layout_uuid, data) {
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
            type: 'new-layout-section',
            layout_uuid,
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of layouts.
     */
    @messagehandler('get-layout-sections', data => data.ids)
    getLayoutSections(...ids) {
        return Promise.all(ids.map(([layout_uuid, id]) => this.getLayoutSection(layout_uuid, id)));
    }

    async getLayoutSection(layout_uuid, uuid) {
        await this.permissions.assertCanGetLayout(layout_uuid);

        this.log.debug('Getting data for layout section', layout_uuid, uuid);

        return await this.server.storage.getItem('LayoutSection.' + layout_uuid + '.' + uuid) || {};
    }

    /**
     * Sets data of layout sections.
     */
    @messagehandler('set-layout-sections', data => data.ids_data)
    setLayoutSections(...ids_data) {
        return Promise.all(ids_data.map(([layout_uuid, id, data]) => this.setLayoutSection(layout_uuid, id, data)));
    }

    async setLayoutSection(layout_uuid, uuid, data) {
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
    deleteLayoutSections(...ids) {
        return Promise.all(ids.map(([layout_uuid, id]) => this.deleteLayoutSection(layout_uuid, id)));
    }

    async deleteLayoutSection(layout_uuid, uuid) {
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
    async listAutomations() {
        const uuids = await this.server.storage.getItem('Automations') || [];

        const authorised_uuids = await this.permissions.getAuthorisedAutomationUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Creates automations.
     */
    @messagehandler('create-automations', data => data.data)
    createAutomations(...data) {
        return Promise.all(data.map(data => this.createAutomation(data)));
    }

    async createAutomation(data) {
        await this.permissions.assertCanCreateAutomations();

        const uuid = genuuid();

        this.log.debug('Creating automation', uuid, data);

        await this.server.storage.setItem('Automation.' + uuid, data);

        // Don't wait for the automation to load
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
    getAutomations(...id) {
        return Promise.all(id.map(id => this.getAutomation(id)));
    }

    async getAutomation(uuid) {
        await this.permissions.assertCanGetAutomation(uuid);

        this.log.debug('Getting data for automation', uuid);

        return await this.server.storage.getItem('Automation.' + uuid) || {};
    }

    /**
     * Gets the user's permissions for automations.
     */
    @messagehandler('get-automations-permissions', data => data.id)
    getAutomationsPermissions(...id) {
        return Promise.all(id.map(id => this.getAutomationPermissions(id)));
    }

    async getAutomationPermissions(uuid) {
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
    setAutomations(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setAutomation(id, data)));
    }

    async setAutomation(uuid, data) {
        await this.permissions.assertCanSetAutomation(uuid);

        this.log.debug('Setting data for automation', uuid, data);

        await this.server.storage.setItem('Automation.' + uuid, data);

        // Don't wait for the automation to load
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
    deleteAutomations(...id) {
        return Promise.all(id.map(id => this.deleteAutomation(id)));
    }

    async deleteAutomation(uuid) {
        await this.permissions.assertCanDeleteAutomation(uuid);

        this.log.debug('Stopping automation', uuid);

        const automation = this.server.automations.automations.find(automation => automation.uuid === uuid);
        await this.server.automations.removeAutomation(automation);

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
    async listScenes() {
        const uuids = await this.server.storage.getItem('Scenes') || [];

        const authorised_uuids = await this.permissions.getAuthorisedSceneUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Creates scenes.
     */
    @messagehandler('create-scenes', data => data.data)
    createScenes(...data) {
        return Promise.all(data.map(data => this.createScene(data)));
    }

    async createScene(data) {
        await this.permissions.assertCanCreateScenes();

        const uuid = genuuid();

        this.log.debug('Creating scene', uuid, data);

        await this.server.storage.setItem('Scene.' + uuid, data);

        // Don't wait for the automation to load
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
    getScenes(...id) {
        return Promise.all(id.map(id => this.getScene(id)));
    }

    async getScene(uuid) {
        await this.permissions.assertCanGetScene(uuid);

        this.log.debug('Getting data for scene', uuid);

        return await this.server.storage.getItem('Scene.' + uuid) || {};
    }

    /**
     * Gets the user's permissions for scenes.
     */
    @messagehandler('get-scenes-permissions', data => data.id)
    getScenesPermissions(...id) {
        return Promise.all(id.map(id => this.getScenePermissions(id)));
    }

    async getScenePermissions(uuid) {
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
    setScenes(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setScene(id, data)));
    }

    async setScene(uuid, data) {
        await this.permissions.assertCanSetScene(uuid);

        this.log.debug('Setting data for scene', uuid, data);

        await this.server.storage.setItem('Scene.' + uuid, data);

        // Don't wait for the scene to load
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
    checkScenesActive(...id) {
        return Promise.all(id.map(id => this.checkSceneActive(id)));
    }

    async checkSceneActive(uuid) {
        await this.permissions.assertCanGetScene(uuid);

        this.log.debug('Checking if scene is active', uuid);

        const scene = this.server.automations.getSceneByUUID(uuid);
        if (!scene) throw new Error('Unknown scene');

        return await scene.active;
    }

    /**
     * Activates scenes.
     */
    @messagehandler('activate-scenes', data => data.id_data)
    activateScenes(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.activateScene(id, data)));
    }

    async activateScene(uuid, context) {
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
    deactivateScenes(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.deactivateScene(id, data)));
    }

    async deactivateScene(uuid, context) {
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
    deleteScenes(...id) {
        return Promise.all(id.map(id => this.deleteScene(id)));
    }

    async deleteScene(uuid) {
        await this.permissions.assertCanDeleteScene(uuid);

        this.log.debug('Removing scene', uuid);

        const scene = this.server.automations.getSceneByUUID(uuid);
        await this.server.automations.removeScene(scene);

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
    async getCommandLineFlags() {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Getting command line flags for', this.id);

        return process.argv;
    }

    @messagehandler('enable-proxy-stdout')
    async enableProxyStdout() {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Enabling stdout proxy for', this.id);
        this.enable_proxy_stdout = true;

        setTimeout(() => this.log.info('Should work'), 1000);
    }

    @messagehandler('disable-proxy-stdout')
    async disableProxyStdout() {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Disabling stdout proxy for', this.id);
        this.enable_proxy_stdout = false;
    }

    /**
     * Gets the UUID of every bridge.
     */
    @messagehandler('list-bridges', data => [data.include_homebridge])
    async listBridges(include_homebridge) {
        const uuids = [];

        for (const bridge of this.server.bridges) {
            if (!include_homebridge && bridge instanceof Homebridge) continue;

            uuids.push(bridge.uuid);
        }

        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    @messagehandler('create-bridges', data => data.data)
    createBridges(...data) {
        return Promise.all(data.map(data => this.createBridge(data)));
    }

    async createBridge(data) {
        await this.permissions.assertCanCreateBridges();

        const uuid = genuuid();
        if (!data.username || !data.username.toLowerCase().match(/^([0-9a-f]{2}:){5}[0-9a-f]$/i)) {
            data.username = await genusername(this.server.storage);
        }

        this.log.debug('Creating bridge', uuid, data);
        await this.server.storage.setItem('Bridge.' + uuid, data);

        this.log.debug('Starting bridge', uuid);
        const bridge = await this.server.loadBridge(data, uuid);
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
    getBridges(...uuid) {
        return Promise.all(uuid.map(uuid => this.getBridge(uuid)));
    }

    async getBridge(uuid) {
        await this.permissions.assertCanGetAccessory(uuid);
        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === uuid);
        this.log.debug('Getting bridge info', uuid);
        if (!bridge) return;

        const bridge_details = {
            uuid,
            accessory_uuids: [],
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
    getBridgesConfiguration(...uuid) {
        return Promise.all(uuid.map(uuid => this.getBridgeConfiguration(uuid)));
    }

    async getBridgeConfiguration(uuid) {
        await this.permissions.assertCanGetAccessory(uuid);
        await this.permissions.assertCanGetBridgeConfiguration(uuid);

        this.log.debug('Getting bridge configuration', uuid);

        const bridge = this.server.bridges.find(b => b.uuid === uuid);
        if (bridge) return bridge.config;

        return this.server.storage.getItem('Bridge.' + uuid) || {};
    }

    /**
     * Gets the user's permissions for a bridge.
     */
    @messagehandler('get-bridges-permissions', data => data.uuid)
    getBridgesConfigurationPermissions(...uuid) {
        return Promise.all(uuid.map(uuid => this.getBridgeConfigurationPermissions(uuid)));
    }

    async getBridgeConfigurationPermissions(uuid) {
        const is_from_config = this.server.config.bridges && this.server.config.bridges
            .find(c => c.uuid ? c.uuid === uuid : hap.uuid.generate('hap-server:bridge:' + c.username) === uuid);

        const [get, set, del] = await Promise.all([
            this.permissions.checkCanGetBridgeConfiguration(uuid),
            this.permissions.checkCanSetBridgeConfiguration(uuid),
            this.permissions.checkCanDeleteBridge(uuid),
        ]);

        return {
            get, set, delete: del,
            is_from_config: is_from_config || this.server.homebridge && this.server.homebridge.uuid === uuid,
        };
    }

    /**
     * Sets the configuration of a bridge.
     */
    @messagehandler('set-bridges-configuration', data => data.uuid_data)
    setBridgesConfiguration(...uuid_data) {
        return Promise.all(uuid_data.map(([uuid, data]) => this.setBridgeConfiguration(uuid, data)));
    }

    async setBridgeConfiguration(uuid, data) {
        await this.permissions.assertCanSetBridgeConfiguration(uuid);

        const is_from_config = (this.server.config.bridges && this.server.config.bridges
            .find(c => c.uuid ? c.uuid === uuid : hap.uuid.generate('hap-server:bridge:' + c.username) === uuid)) ||
            (this.server.homebridge && this.server.homebridge.uuid === uuid);
        if (is_from_config) throw new Error('Cannot update bridges not created in the web interface');

        if (!data.username || !data.username.toLowerCase().match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) {
            data.username = await genusername(this.server.storage);
        }

        const bridge = this.server.bridges.find(b => b.uuid === uuid);
        if (!bridge) throw new Error('Unknown bridge');

        if (!isEqual(
            Object.assign({}, {accessories: undefined}, data, {accessories: undefined}),
            Object.assign({}, {accessories: undefined}, bridge.config, {accessories: undefined})
        )) {
            this.log.debug('Stopping bridge', uuid);
            await this.server.unloadBridge(uuid);

            this.log.debug('Setting bridge configuration', uuid, data);
            await this.server.storage.setItem('Bridge.' + uuid, data);

            this.log.debug('Starting bridge', uuid);
            const bridge = await this.server.loadBridge(data, uuid);
            await bridge.publish();
        } else {
            this.log.debug('Setting bridge configuration', uuid, bridge.config, data);
            await this.server.storage.setItem('Bridge.' + uuid, data);

            // If only the accessories have changed then update the existing bridge's accessories

            const old_accessories = bridge.config.accessories || [];
            const new_accessories = data.accessories || [];
            const added_accessories = new_accessories.filter(u => !old_accessories.includes(u));
            const removed_accessories = old_accessories.filter(u => !new_accessories.includes(u));

            bridge.config = data;
            bridge.accessory_uuids = data.accessories || [];

            this.log.debug('Updating accessories', added_accessories, removed_accessories);

            bridge.patchAccessories(
                added_accessories.map(u => this.server.getAccessory(u)).filter(a => a),
                removed_accessories.map(u => this.server.getAccessory(u))
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
    deleteBridges(...uuid) {
        return Promise.all(uuid.map(uuid => this.deleteBridge(uuid)));
    }

    async deleteBridge(uuid) {
        await this.permissions.assertCanDeleteBridge(uuid);

        const is_from_config = (this.server.config.bridges && this.server.config.bridges
            .find(c => c.uuid ? c.uuid === uuid : hap.uuid.generate('hap-server:bridge:' + c.username) === uuid)) ||
            (this.server.homebridge && this.server.homebridge.uuid === uuid);
        if (is_from_config) throw new Error('Cannot delete bridges not created in the web interface');

        this.log.debug('Stopping bridge', uuid);
        await this.server.unloadBridge(uuid);

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
    getBridgesPairingDetails(bridge_uuid) {
        return Promise.all(bridge_uuid.map(bridge_uuid => this.getBridgePairingDetails(bridge_uuid)));
    }

    async getBridgePairingDetails(bridge_uuid) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return;

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
    resetBridgesPairings(bridge_uuid) {
        return Promise.all(bridge_uuid.map(bridge_uuid => this.resetBridgePairings(bridge_uuid)));
    }

    async resetBridgePairings(bridge_uuid) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return;

        for (const client_username of Object.keys(bridge.accessory_info.pairedClients)) {
            bridge.accessory_info.removePairedClient(client_username);
        }

        bridge.accessory_info.save();
        if (bridge.hasOwnProperty('hap_server')) bridge.hap_server.updateAdvertisement();
    }

    /**
     * Lists pairings.
     */
    @messagehandler('list-pairings', data => [data.bridge_uuid])
    async listPairings(bridge_uuid) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null;

        const ids = [];

        for (const client_username of Object.keys(bridge.accessory_info.pairedClients)) {
            ids.push(client_username);
        }

        return ids;
    }

    /**
     * Gets the details of pairings.
     */
    @messagehandler('get-pairings', data => data.ids)
    getPairings(...id) {
        return Promise.all(id.map(([bridge_uuid, id]) => this.getPairing(bridge_uuid, id)));
    }

    async getPairing(bridge_uuid, id) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        // await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null;

        const public_key = bridge.accessory_info.pairedClients[id];

        return {
            bridge_uuid,
            id,
            public_key: public_key.toString('hex'),
        };
    }

    /**
     * Gets the details of HAP pairings.
     * This is stored by the web interface.
     */
    @messagehandler('get-pairings-data', data => data.id)
    getPairingsData(...id) {
        return Promise.all(id.map(id => this.getPairingData(id)));
    }

    async getPairingData(id) {
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
    getPairingsPermissions(...id) {
        return Promise.all(id.map(id => this.getPairingPermissions(id)));
    }

    async getPairingPermissions(id) {
        // eslint-disable-next-line no-unused-vars
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
    setPairingsData(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setPairingData(id, data)));
    }

    async setPairingData(id, data) {
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
    getWebInterfacePlugins() {
        return PluginManager.getWebInterfacePlugins().map(ui_plugin => {
            const plugin_authentication_handlers = {};
            for (const [localid, authentication_handler] of ui_plugin.plugin.authentication_handlers.entries()) {
                plugin_authentication_handlers[localid] = authentication_handler.id;
            }

            const plugin_user_management_handlers = {};
            for (const [localid, user_management_handler] of ui_plugin.plugin.user_management_handlers.entries()) {
                plugin_user_management_handlers[localid] = user_management_handler.id;
            }

            const plugin_accessory_discovery_handlers = {};
            const plugin_accessory_discovery_handler_setup_handlers = {};
            for (const [localid, accessory_discovery] of ui_plugin.plugin.accessory_discovery.entries()) {
                plugin_accessory_discovery_handlers[localid] = accessory_discovery.id;
                plugin_accessory_discovery_handler_setup_handlers[localid] = accessory_discovery.setup.id;
            }

            const plugin_accessory_setup_handlers = {};
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

    async handleAuthenticateMessage(messageid, data) {
        try {
            if (typeof data.authentication_handler_id === 'number') {
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
            } else if (data.token) {
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
            } else if (data.cli_token) {
                const token = data.cli_token;

                this.log.info('Authenticating with CLI token');

                if (!this.server.cli_auth_token || this.server.cli_auth_token !== token) {
                    throw new Error('Invalid token');
                }

                this.authenticated_user = new AuthenticatedUser('cli-token', 'Admin');

                return this.respond(messageid, {
                    data: this.authenticated_user,
                    user_id: this.authenticated_user.id,
                });
            } else if (data.setup_token) {
                const token = data.setup_token.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z ]/g, '');

                this.log.info('Authenticating with setup token', token);

                if ([...this.server.wss.clients].map(s => (this.constructor as typeof Connection).getConnectionForWebSocket(s))
                    .find(c => c.authenticated_user && c.authenticated_user.id === 'cli-token')
                ) {
                    throw new Error('Another client is authenticated as the setup user.');
                }

                if (await this.server.storage.getItem('HasCompletedSetup')) {
                    throw new Error('Setup has already been completed.');
                }

                if (!this.server.setup_token || this.server.setup_token.join(' ') !== token) {
                    throw new Error('Invalid token.');
                }

                this.authenticated_user = new AuthenticatedUser('cli-token', 'Setup user');

                return this.respond(messageid, {
                    data: this.authenticated_user,
                    user_id: this.authenticated_user.id,
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

    async sendAuthenticateResponse(messageid, response) {
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
                authentication_handler_id: response.authentication_handler_id,
                asset_token: await this.getAssetToken(),
            });
        }

        return this.respond(messageid, {
            success: false,
            data: response,
        });
    }

    async handleUserManagementMessage(messageid, data) {
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
    async getUsersPermissions(...id) {
        return Promise.all(id.map(id => this.getUserPermissions(id)));
    }

    async getUserPermissions(user_id) {
        await this.permissions.assertCanManageUsers();
        await this.permissions.assertCanManagePermissions();

        return this.server.storage.getItem('Permissions.' + user_id);
    }

    /**
     * Sets user permissions.
     */
    @messagehandler('set-users-permissions', data => data.id_data)
    async setUsersPermissions(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setUserPermissions(id, data)));
    }

    async setUserPermissions(user_id, data) {
        await this.permissions.assertCanManageUsers();
        await this.permissions.assertCanManagePermissions();

        await this.server.storage.setItem('Permissions.' + user_id, data);

        for (const ws of this.server.wss.clients) {
            const connection = Connection.getConnectionForWebSocket(ws);

            if (ws.readyState !== 1 || !connection.authenticated_user ||
                connection.authenticated_user.id !== user_id
            ) continue;

            // Clear the cached permissions
            delete connection.permissions.permissions;

            connection.sendBroadcast({
                type: 'update-permissions',
                data: await this.getHomePermissions(),
            });
        }
    }

    async handleAccessorySetupMessage(messageid, data) {
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
    async openConsole() {
        await this.permissions.assertCanOpenWebConsole();

        const id = this.console_id++;

        const input = new stream.Readable({
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

        const console = {input, output, subprocesses: new Set(), repl_server: null};
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
                    subprocess.stdout.on('data', data => output.write(data));
                    subprocess.stderr.on('data', data => output.write(data));
                    console.input = subprocess.stdin as any;
                    const {code, signal} = await new Promise(rs =>
                        subprocess.on('exit', (code, signal) => rs({code, signal})));
                    console.input = input;
                    console.subprocesses.delete(subprocess);
                    repl_server.resume();
                    this.log.info('Command %s exited with %s %d', command, signal ? 'signal' : 'code', signal ? signal : code);
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
    async closeConsole(id) {
        const {repl_server, subprocesses} = this.open_consoles.get(id) || {};
        if (!repl_server) throw new Error('Unknown console with ID "' + id + '"');

        repl_server.close();
        this.open_consoles.delete(id);

        for (const subprocess of subprocesses) {
            subprocess.kill();
        }
    }

    @messagehandler('console-input', data => [data.id, data.data])
    async handleConsoleInput(id, data) {
        const {repl_server, input} = this.open_consoles.get(id) || {};
        if (!repl_server) throw new Error('Unknown console with ID "' + id + '"');

        if (input.writable) input.write(data, 'utf-8');
        else input.push(data, 'utf-8');
    }
}

if (DEVELOPMENT) {
    const development_data = exports.development_data = {
        vue_devtools_host: '127.0.0.1',
        vue_devtools_port: 0,
    };

    message_methods['development-data'] = 'handleDevelopmentDataMessage';

    (Connection as any).prototype.handleDevelopmentDataMessage = function(messageid) {
        this.respond(messageid, development_data);
    };

    exports.enableVueDevtools = function(host, port) {
        development_data.vue_devtools_host = host;
        development_data.vue_devtools_port = port;
    };
}
