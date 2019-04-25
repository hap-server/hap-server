
import process from 'process';
import crypto from 'crypto';
import path from 'path';
import url from 'url';
import querystring from 'querystring';
import fs from 'fs';
import genuuid from 'uuid/v4';

import PluginManager, {AuthenticatedUser} from './plugins';
import Homebridge from './homebridge';
import Permissions from './permissions';

let id = 0;

const message_methods = {
    'list-accessories': 'handleListAccessoriesMessage',
    'get-accessories': 'handleGetAccessoriesMessage',
    'get-accessories-permissions': 'handleGetAccessoriesPermissionsMessage',
    'get-characteristics': 'handleGetCharacteristicsMessage',
    'set-characteristics': 'handleSetCharacteristicsMessage',
    'get-accessories-data': 'handleGetAccessoriesDataMessage',
    'set-accessories-data': 'handleSetAccessoriesDataMessage',
    'get-home-settings': 'handleGetHomeSettingsMessage',
    'get-home-permissions': 'handleGetHomePermissionsMessage',
    'set-home-settings': 'handleSetHomeSettingsMessage',
    'list-layouts': 'handleListLayoutsMessage',
    'create-layouts': 'handleCreateLayoutsMessage',
    'get-layouts': 'handleGetLayoutsMessage',
    'get-layouts-permissions': 'handleGetLayoutsPermissionsMessage',
    'set-layouts': 'handleSetLayoutsMessage',
    'delete-layouts': 'handleDeleteLayoutsMessage',
    'get-command-line-flags': 'handleGetCommandLineFlagsMessage',
    'enable-proxy-stdout': 'handleEnableProxyStdoutMessage',
    'disable-proxy-stdout': 'handleDisableProxyStdoutMessage',
    'list-bridges': 'handleListBridgesMessage',
    'get-bridges': 'handleGetBridgesMessage',
    'list-pairings': 'handleListPairingsMessage',
    'get-pairings': 'handleGetPairingsMessage',
    'get-pairings-data': 'handleGetPairingsDataMessage',
    'set-pairings-data': 'handleSetPairingsDataMessage',
    'get-accessory-uis': 'handleGetAccessoryUIsMessage',
    'authenticate': 'handleAuthenticateMessage',
};

const hide_authentication_keys = [
    'password', 'token',
];

const ws_map = new WeakMap();

const DEVELOPMENT = true;

export default class Connection {
    constructor(server, ws, req) {
        this.server = server;
        this.ws = ws;
        this.id = id++;
        this.log = server.log.withPrefix('Connection #' + this.id);
        this.authenticated_user = null;
        this.enable_proxy_stdout = false;
        this.last_message = null;
        this.closed = false;
        this.req = req;
        this.uploads = [];

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
                if (this.authenticated_user) {
                    this.authenticated_user.authentication_handler.handleDisconnect(this.authenticated_user);
                }
            } catch (err) {
                this.log.error('Error in disconnect handler', err);
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

    async respond(messageid, data) {
        if (data instanceof Promise) {
            try {
                data = await data;
            } catch (err) {
                this.log.error('Error in message handler', err);

                data = {
                    reject: true,
                    error: err instanceof Error,
                    constructor: err.constructor.name,
                    data: err instanceof Error ? {message: err.message, code: err.code, stack: err.stack} : err,
                };
            }
        }

        this.ws.send('*' + messageid + ':' + JSON.stringify(data));
    }

    handleMessage(messageid, data) {
        // this.server.log.debug('Received message', data, 'from', this.id, 'with messageid', messageid);

        if (data === 'ping') {
            this.respond(messageid, 'pong');
            return;
        }

        if (data && data.type && message_methods[data.type]) {
            this[message_methods[data.type]].call(this, messageid, data);
            return;
        }
    }

    async getAssetToken() {
        if (this.asset_token) return this.asset_token;

        const bytes = await new Promise((rs, rj) => crypto.randomBytes(48, (err, bytes) => err ? rj(err) : rs(bytes)));
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
    handleListAccessoriesMessage(messageid, data) {
        this.respond(messageid, this.listAccessories());
    }

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
    handleGetAccessoriesMessage(messageid, data) {
        this.respond(messageid, this.getAccessories(...data.id));
    }

    getAccessories(...id) {
        return Promise.all(id.map(id => this.getAccessory(id)));
    }

    async getAccessory(uuid) {
        await this.permissions.assertCanGetAccessory(uuid);

        const accessory = this.server.getAccessory(uuid);

        if (!accessory) return null;

        const hap = accessory.toHAP()[0];

        // Add service subtypes
        for (const service of accessory.services) {
            const service_hap = hap.services.find(s => s.iid === service.iid);

            service_hap.subtype = service.subtype;
        }

        return hap;
    }

    /**
     * Gets the user's permissions for accessories.
     */
    handleGetAccessoriesPermissionsMessage(messageid, data) {
        this.respond(messageid, this.getAccessoriesPermissions(...data.id));
    }

    getAccessoriesPermissions(...id) {
        return Promise.all(id.map(id => this.getAccessoryPermissions(id)));
    }

    async getAccessoryPermissions(uuid) {
        const accessory = this.server.getAccessory(uuid);

        if (!accessory) return;

        const [get, set, set_characteristics] = await Promise.all([
            this.permissions.checkCanGetAccessory(uuid),
            this.permissions.checkCanSetAccessoryData(uuid),

            Promise.all(accessory.services.map(async s => {
                return [s.UUID, await Promise.all(s.characteristics.map(c => c.UUID)
                    .filter(c => this.permissions.checkCanSetCharacteristic(uuid, s.UUID, c)))];
            })).then(s => s.reduce((services, v) => services[v[0]] = v[1], {})),
        ]);

        return {get, set, set_characteristics};
    }

    /**
     * Gets the value of a characteristic.
     */
    handleGetCharacteristicsMessage(messageid, data) {
        this.respond(messageid, this.getCharacteristics(...data.ids));
    }

    getCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.getCharacteristic(...ids)));
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

        return characteristic.toHAP();
    }

    /**
     * Sets the value of a characteristic.
     */
    handleSetCharacteristicsMessage(messageid, data) {
        this.respond(messageid, this.setCharacteristics(...data.ids_data));
    }

    setCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.setCharacteristic(...ids)));
    }

    async setCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        await this.permissions.assertCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value);

        // this.server.log.info('Setting characteristic', accessory_uuid, service_uuid, characteristic_uuid, 'to', value);

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

        return characteristic.setValue(value);
    }

    /**
     * Gets the details of accessories.
     * This is stored by the web UI.
     */
    handleGetAccessoriesDataMessage(messageid, data) {
        this.respond(messageid, this.getAccessoriesData(...data.id));
    }

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
    handleSetAccessoriesDataMessage(messageid, data) {
        this.respond(messageid, this.setAccessoriesData(...data.id_data));
    }

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
     * Gets global settings.
     */
    handleGetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, this.getHomeSettings());
    }

    async getHomeSettings() {
        await this.permissions.assertCanGetHomeSettings();

        this.log.debug('Getting global settings');

        return await this.server.storage.getItem('Home') || {};
    }

    /**
     * Gets the user's global permissions.
     */
    handleGetHomePermissionsMessage(messageid) {
        this.respond(messageid, this.getHomePermissions());
    }

    async getHomePermissions() {
        const [get, set, create_layouts, server] = await Promise.all([
            this.permissions.checkCanGetHomeSettings(),
            this.permissions.checkCanSetHomeSettings(),
            this.permissions.checkCanCreateLayouts(),
            this.permissions.checkCanAccessServerRuntimeInfo(),
        ]);

        return {get, set, create_layouts, server};
    }

    /**
     * Sets global settings.
     */
    handleSetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, this.setHomeSettings(data.data));
    }

    async setHomeSettings(data) {
        await this.permissions.assertCanSetHomeSettings();

        if (data.background_url && data.background_url.indexOf(path.sep) > -1) {
            throw new Error('Background filenames cannot have directory separators');
        }

        this.log.debug('Setting global settings', data);

        const previous_data = await this.server.storage.getItem('Home');

        await this.server.storage.setItem('Home', data);

        let index;
        while ((index = this.uploads.findIndex(f => f.filename === data.background_url)) > -1) this.uploads.splice(index, 1);

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
    handleListLayoutsMessage(messageid, data) {
        this.respond(messageid, this.listLayouts());
    }

    async listLayouts() {
        const uuids = [].concat(await this.server.storage.getItem('Layouts'));

        const authorised_uuids = await this.permissions.getAuthorisedLayoutUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Creates layouts.
     */
    handleCreateLayoutsMessage(messageid, data) {
        this.respond(messageid, this.createLayouts(...data.data));
    }

    createLayouts(...data) {
        return Promise.all(data.map(data => this.createLayout(data)));
    }

    async createLayout(data) {
        await this.permissions.assertCanCreateLayouts();

        if (data.background_url && data.background_url.indexOf(path.sep) > -1) {
            throw new Error('Background filenames cannot have directory separators');
        }

        const uuid = genuuid();
        // const uuid = 'test2';

        this.log.debug('Creating layout', uuid, data);

        await this.server.storage.setItem('Layout.' + uuid, data);

        const layout_uuids = await this.server.storage.getItem('Layouts') || [];
        if (!layout_uuids.includes(uuid)) {
            layout_uuids.push(uuid);
            await this.server.storage.setItem('Layouts', layout_uuids);
        }

        let index;
        while ((index = this.uploads.findIndex(f => f.filename === data.background_url)) > -1) this.uploads.splice(index, 1);

        this.server.sendBroadcast({
            type: 'new-layout',
            uuid,
        }, this.ws);

        return uuid;
    }

    /**
     * Gets data of layouts.
     */
    handleGetLayoutsMessage(messageid, data) {
        this.respond(messageid, this.getLayouts(...data.id));
    }

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
    handleGetLayoutsPermissionsMessage(messageid, data) {
        this.respond(messageid, this.getLayoutsPermissions(...data.id));
    }

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
    handleSetLayoutsMessage(messageid, data) {
        this.respond(messageid, this.setLayouts(...data.id_data));
    }

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
        while ((index = this.uploads.findIndex(f => f.filename === data.background_url)) > -1) this.uploads.splice(index, 1);

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
    handleDeleteLayoutsMessage(messageid, data) {
        this.respond(messageid, this.deleteLayouts(...data.id));
    }

    deleteLayouts(...id) {
        return Promise.all(id.map(id => this.deleteLayout(id)));
    }

    async deleteLayout(uuid) {
        await this.permissions.assertCanDeleteLayout(uuid);

        this.log.debug('Deleting layout', uuid);

        const data = await this.server.storage.getItem('Layout.' + uuid);

        const layout_uuids = await this.server.storage.getItem('Layouts') || [];
        let index;
        while ((index = layout_uuids.indexOf(uuid)) > -1) {
            layout_uuids.splice(index, 1);
        }
        await this.server.storage.setItem('Layouts', layout_uuids);

        await this.server.storage.removeItem('Layout.' + uuid);

        this.server.sendBroadcast({
            type: 'remove-layout',
            uuid,
        }, this.ws);

        if (data && data.background_url) {
            const home_settings = await this.server.storage.getItem('Home');

            if (home_settings && home_settings.background_url === previous_data.background_url) return;

            for (const layout_uuid of await this.server.storage.getItem('Layouts')) {
                const layout = await this.server.storage.getItem('Layout.' + layout_uuid);

                if (layout && layout.background_url === data.background_url) return;
            }

            // Delete the background image as no other layout is using it
            await new Promise((rs, rj) => fs.unlink(path.join(this.server.assets_path, data.background_url),
                err => err ? rj(err) : rs()));
        }
    }

    handleGetCommandLineFlagsMessage(messageid) {
        this.respond(messageid, this.getCommandLineFlags());
    }

    async getCommandLineFlags() {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Getting command line flags for', this.id);

        return process.argv;
    }

    handleEnableProxyStdoutMessage(messageid) {
        this.respond(messageid, this.enableProxyStdout());
    }

    async enableProxyStdout(messageid) {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Enabling stdout proxy for', this.id);
        this.enable_proxy_stdout = true;

        setTimeout(() => this.log.info('Should work'), 1000);

        this.respond(messageid);
    }

    handleDisableProxyStdoutMessage(messageid) {
        this.respond(messageid, this.disableProxyStdout());
    }

    async disableProxyStdout(messageid) {
        await this.permissions.assertCanAccessServerRuntimeInfo();

        this.log.info('Disabling stdout proxy for', this.id);
        this.enable_proxy_stdout = false;

        this.respond(messageid);
    }

    /**
     * Gets the UUID of every bridge.
     */
    handleListBridgesMessage(messageid, data) {
        this.respond(messageid, this.listBridges(data.include_homebridge));
    }

    async listBridges(include_homebridge) {
        const uuids = [];

        for (const bridge of this.server.bridges) {
            if (!include_homebridge && bridge instanceof Homebridge) continue;

            uuids.push(bridge.uuid);
        }

        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();
        return uuids.filter(uuid => authorised_uuids.includes(uuid));
    }

    /**
     * Gets the details of a bridge.
     */
    handleGetBridgesMessage(messageid, data) {
        this.respond(messageid, this.getBridges(...data.uuid));
    }

    getBridges(...uuid) {
        return Promise.all(uuid.map(uuid => this.getBridge(uuid)));
    }

    async getBridge(uuid) {
        await this.permissions.assertCanGetAccessory(uuid);
        const authorised_uuids = await this.permissions.getAuthorisedAccessoryUUIDs();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === uuid);
        this.log.debug('Getting bridge info', uuid, bridge);
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
     * Lists pairings.
     */
    handleListPairingsMessage(messageid, data) {
        this.respond(messageid, this.listPairings(data.bridge_uuid));
    }

    async listPairings(bridge_uuid) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null;

        const ids = [];

        for (const client_username of Object.keys(bridge.bridge._accessoryInfo.pairedClients)) {
            ids.push(client_username);
        }

        return ids;
    }

    /**
     * Gets the details of pairings.
     */
    handleGetPairingsMessage(messageid, data) {
        this.respond(messageid, this.getPairings(...data.ids));
    }

    getPairings(...id) {
        return Promise.all(id.map(([bridge_uuid, id]) => this.getPairing(bridge_uuid, id)));
    }

    async getPairing(bridge_uuid, id) {
        await this.permissions.assertCanGetAccessory(bridge_uuid);
        await this.permissions.assertCanAccessServerRuntimeInfo();

        const bridge = this.server.bridges.find(bridge => bridge.uuid === bridge_uuid);
        if (!bridge) return null;

        const public_key = bridge.bridge._accessoryInfo.pairedClients[id];

        return {
            bridge_uuid,
            id,
            public_key: public_key.toString('hex'),
        };
    }

    /**
     * Gets accessory UIs.
     */
    handleGetAccessoryUIsMessage(messageid, data) {
        this.respond(messageid, this.getAccessoryUIs());
    }

    getAccessoryUIs() {
        return PluginManager.getAccessoryUIs().map(accessory_ui => {
            const plugin_authentication_handlers = {};

            for (const [localid, authentication_handler] of accessory_ui.plugin.authentication_handlers.entries()) {
                plugin_authentication_handlers[localid] = authentication_handler.id;
            }

            return {
                id: accessory_ui.id,
                scripts: accessory_ui.scripts,

                plugin_authentication_handlers,
            };
        });
    }

    async handleAuthenticateMessage(messageid, data) {
        try {
            if (typeof data.authentication_handler_id === 'number') {
                const id = data.authentication_handler_id;
                const authentication_handler = PluginManager.getAuthenticationHandler(id);

                const logdata = Object.assign({}, data);
                for (const k of hide_authentication_keys) if (logdata.hasOwnProperty(k)) logdata[k] = null;

                this.log.info('Received authenticate message', messageid, logdata, authentication_handler);

                if (!authentication_handler) {
                    throw new Error('Unknown authentication handler');
                }

                const response = await authentication_handler.handleMessage(data.data, this.authenticated_user);

                await this.sendAuthenticateResponse(messageid, response);
            } else if (data.token) {
                const token = data.token;

                this.log.info('Resuming session');

                const session = await this.server.storage.getItem('Session.' + token);
                if (!session) throw new Error('Invalid session');

                const plugin = PluginManager.getPlugin(session.authentication_handler_plugin);
                if (!plugin) throw new Error('Unknown authentication handler');

                const authentication_handler = plugin.getAuthenticationHandler(session.authentication_handler);
                if (!authentication_handler) throw new Error('Unknown authentication handler');

                const authenticated_user = await authentication_handler.handleResumeSession(token, session.authenticated_user);

                await this.sendAuthenticateResponse(messageid, authenticated_user);
            } else {
                throw new Error('Unknown authentication handler');
            }
        } catch (err) {
            this.log.error('Error authenticating', err);

            this.respond(messageid, {
                reject: true,
                error: err instanceof Error,
                constructor: err.constructor.name,
                data: err instanceof Error ? {message: err.message, code: err.code, stack: err.stack} : err,
            });
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
                    this.authenticated_user.authentication_handler.handleReauthenticate(this.authenticated_user);
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
}

if (DEVELOPMENT) {
    const development_data = exports.development_data = {
        vue_devtools_host: '127.0.0.1',
        vue_devtools_port: 0,
    };

    message_methods['development-data'] = 'handleDevelopmentDataMessage';

    Connection.prototype.handleDevelopmentDataMessage = function(messageid) {
        this.respond(messageid, development_data);
    };

    exports.enableVueDevtools = function(host, port) {
        development_data.vue_devtools_host = host;
        development_data.vue_devtools_port = port;
    };
}
