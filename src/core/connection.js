
import PluginManager from './plugins';
import Homebridge from './homebridge';

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
    'enable-proxy-stdout': 'handleEnableProxyStdoutMessage',
    'disable-proxy-stdout': 'handleDisableProxyStdoutMessage',
    'list-bridges': 'handleListBridgesMessage',
    'get-bridges': 'handleGetBridgesMessage',
    'list-pairings': 'handleListPairingsMessage',
    'get-pairings': 'handleGetPairingsMessage',
    'get-pairings-data': 'handleGetPairingsDataMessage',
    'set-pairings-data': 'handleSetPairingsDataMessage',
    'get-accessory-uis': 'handleGetAccessoryUIsMessage',
};

const ws_map = new WeakMap();

export default class Connection {
    constructor(server, ws) {
        this.server = server;
        this.ws = ws;
        this.id = id++;
        this.enable_proxy_stdout = false;

        // this.server.log.debug('WebSocket connection', this.id, this.ws);

        ws_map.set(this.ws, this);

        ws.on('message', message => {
            // this.server.log.debug('Received', this.id, message);

            if (message === 'pong') {
                this.server.log.info('Received ping response');
                return;
            }

            const match = message.match(/^\*([0-9]+)\:(.*)$/);

            if (!match) {
                this.server.log.error('Received invalid message from client', this.id);
                return;
            }

            const messageid = parseInt(match[1]);
            const data = match[2] !== 'undefined' ? JSON.parse(match[2]) : undefined;

            this.handleMessage(messageid, data);
        });

        ws.send('ping');
    }

    static getConnectionForWebSocket(ws) {
        return ws_map.get(ws);
    }

    sendBroadcast(data) {
        this.ws.send('**:' + JSON.stringify(data));
    }

    respond(messageid, data) {
        this.ws.send('*' + messageid + ':' + JSON.stringify(data));
    }

    handleMessage(messageid, data) {
        this.server.log.debug('Received message', data, 'from', this.id, 'with messageid', messageid);

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
    async handleListAccessoriesMessage(messageid, data) {
        this.respond(messageid, await this.listAccessories());
    }

    listAccessories() {
        const uuids = [];

        for (const bridge of this.server.bridges) {
            if (!bridge instanceof Homebridge) continue;
            uuids.push(bridge.uuid);

            for (const accessory of bridge.bridge.bridgedAccessories) {
                uuids.push(accessory.UUID);
            }
        }

        for (const accessory of this.server.accessories) {
            uuids.push(accessory.uuid);
        }

        return uuids;
    }

    /**
     * Gets the details of accessories.
     * This is what the accessory exposes.
     */
    async handleGetAccessoriesMessage(messageid, data) {
        this.respond(messageid, await this.getAccessories(...data.id));
    }

    getAccessories(...id) {
        return Promise.all(id.map(id => this.getAccessory(id)));
    }

    getAccessory(uuid) {
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
    async handleGetCharacteristicsMessage(messageid, data) {
        this.respond(messageid, await this.getCharacteristics(...data.ids));
    }

    getCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.getCharacteristic(...ids)));
    }

    getCharacteristic(accessory_uuid, service_uuid, characteristic_uuid) {
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
    async handleSetCharacteristicsMessage(messageid, data) {
        this.respond(messageid, await this.setCharacteristics(...data.ids_data));
    }

    setCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.setCharacteristic(...ids)));
    }

    setCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        this.server.log.info('Setting characteristic', accessory_uuid, service_uuid, characteristic_uuid, 'to', value);

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
    async handleGetAccessoriesDataMessage(messageid, data) {
        this.respond(messageid, await this.getAccessoriesData(...data.id));
    }

    getAccessoriesData(...id) {
        return Promise.all(id.map(id => this.getAccessoryData(id)));
    }

    async getAccessoryData(id) {
        //
        this.server.log.debug('Getting data for accessory', id);

        return await this.server.storage.getItem('AccessoryData.' + id) || {};
    }

    /**
     * Sets extra data of accessories.
     * This is stored by the web UI.
     */
    async handleSetAccessoriesDataMessage(messageid, data) {
        this.respond(messageid, await this.setAccessoriesData(...data.id_data));
    }

    setAccessoriesData(...id_data) {
        return Promise.all(id_data.map(([id, data]) => this.setAccessoryData(id, data)));
    }

    async setAccessoryData(uuid, data) {
        //
        this.server.log.debug('Setting data for accessory', uuid, data);

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
    async handleGetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, await this.getHomeSettings());
    }

    async getHomeSettings() {
        this.server.log.debug('Getting global settings');

        return await this.server.storage.getItem('Home') || {};
    }

    /**
     * Sets global settings.
     */
    async handleSetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, await this.setHomeSettings(data.data));
    }

    async setHomeSettings(data) {
        this.server.log.debug('Setting global settings', data);

        await this.server.storage.setItem('Home', data);

        this.server.sendBroadcast({
            type: 'update-home-settings',
            data,
        }, this.ws);
    }

    handleEnableProxyStdoutMessage(messageid) {
        this.server.log.info('Enabling stdout proxy for', this.id);
        this.enable_proxy_stdout = true;

        setTimeout(() => this.server.log.info('Should work'), 1000);

        this.respond(messageid);
    }

    handleDisableProxyStdoutMessage(messageid) {
        this.server.log.info('Disabling stdout proxy for', this.id);
        this.enable_proxy_stdout = false;

        this.respond(messageid);
    }

    /**
     * Gets the UUID of every bridge.
     */
    async handleListBridgesMessage(messageid, data) {
        this.respond(messageid, await this.listBridges(data.include_homebridge));
    }

    listBridges(include_homebridge) {
        const uuids = [];

        for (const bridge of this.server.bridges) {
            if (!include_homebridge && bridge instanceof Homebridge) continue;

            uuids.push(bridge.uuid);
        }

        return uuids;
    }

    /**
     * Gets the details of a bridge.
     */
    async handleGetBridgesMessage(messageid, data) {
        this.respond(messageid, await this.getBridges(...data.uuid));
    }

    getBridges(...uuid) {
        return Promise.all(uuid.map(uuid => this.getBridge(uuid)));
    }

    getBridge(uuid) {
        const bridge = this.server.bridges.find(bridge => bridge.uuid === uuid);
        this.server.log.debug('Getting bridge info', uuid, bridge);
        if (!bridge) return;

        const bridge_details = {
            uuid,
            accessory_uuids: [],
        };

        for (const accessory of bridge.bridge.bridgedAccessories) {
            bridge_details.accessory_uuids.push(accessory.UUID);
        }

        return bridge_details;
    }

    /**
     * Lists pairings.
     */
    async handleListPairingsMessage(messageid, data) {
        this.respond(messageid, await this.listPairings(data.bridge_uuid));
    }

    listPairings(bridge_uuid) {
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
    async handleGetPairingsMessage(messageid, data) {
        this.respond(messageid, await this.getPairings(...data.ids));
    }

    getPairings(...id) {
        return Promise.all(id.map(([bridge_uuid, id]) => this.getPairing(bridge_uuid, id)));
    }

    getPairing(bridge_uuid, id) {
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
    async handleGetAccessoryUIsMessage(messageid, data) {
        this.respond(messageid, await this.getAccessoryUIs());
    }

    getAccessoryUIs() {
        return PluginManager.getAccessoryUIs().map(accessory_ui => {
            return {
                id: accessory_ui.id,
                scripts: accessory_ui.scripts,
            };
        });
    }
}
