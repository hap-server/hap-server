
import process from 'process';
import PluginManager, {AuthenticatedUser} from './plugins';
import Homebridge from './homebridge';
import Permissions from './permissions';

let id = 0;

const message_methods = {
    'list-accessories': 'handleListAccessoriesMessage',
    'get-accessories': 'handleGetAccessoriesMessage',
    'get-characteristics': 'handleGetCharacteristicsMessage',
    'set-characteristics': 'handleSetCharacteristicsMessage',
    'get-accessories-data': 'handleGetAccessoriesDataMessage',
    'set-accessories-data': 'handleSetAccessoriesDataMessage',
    'get-home-settings': 'handleGetHomeSettingsMessage',
    'set-home-settings': 'handleSetHomeSettingsMessage',
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

        ws.on('close', code => {
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
        await this.permissions.assertCanSetAccessoryData(accessory_uuid);

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
     * Sets global settings.
     */
    handleSetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, this.setHomeSettings(data.data));
    }

    async setHomeSettings(data) {
        await this.permissions.assertCanSetHomeSettings();

        this.log.debug('Setting global settings', data);

        await this.server.storage.setItem('Home', data);

        this.server.sendBroadcast({
            type: 'update-home-settings',
            data,
        }, this.ws);
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

                this.log.info('Received authenticate message', messageid, data, authentication_handler);

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

                const authentication_handler = PluginManager.getAuthenticationHandler(session.authentication_handler_id);
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
                    authentication_handler_id: response.authentication_handler.id,
                    authenticated_user: response,
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
                token: response.token,
                authentication_handler_id: response.authentication_handler_id,
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
