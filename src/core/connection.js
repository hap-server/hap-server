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
};

const ws_map = new WeakMap();

export default class Connection {
    constructor(server, ws) {
        this.server = server;
        this.ws = ws;
        this.id = id++;
        this.enable_proxy_stdout = false;

        this.server.log.debug('WebSocket connection', this.id, this.ws);

        ws_map.set(this.ws, this);

        ws.on('message', message => {
            this.server.log.debug('Received', this.id, message);

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

    async handleListAccessoriesMessage(messageid, data) {
        this.respond(messageid, await this.listAccessories());
    }

    /**
     * Gets the UUID of every accessory.
     */
    listAccessories() {
        const uuids = [];

        for (let bridge of [this.server.homebridge._bridge]) {
            uuids.push(bridge.UUID);

            for (let accessory of bridge.bridgedAccessories) {
                uuids.push(accessory.UUID);
            }
        }

        return uuids;
    }

    async handleGetAccessoriesMessage(messageid, data) {
        this.respond(messageid, await this.getAccessories(...data.id));
    }

    /**
     * Gets the details of accessories.
     * This is what the accessory exposes.
     */
    getAccessories(...id) {
        return Promise.all(id.map(id => this.getAccessory(id)));
    }

    getAccessory(id) {
        for (let bridge of [this.server.homebridge._bridge]) {
            if (bridge.UUID === id) return bridge.toHAP()[0];

            for (let accessory of bridge.bridgedAccessories) {
                if (accessory.UUID === id) return accessory.toHAP()[0];
            }
        }

        //
        return {
            name: 'Test 2',
        };
    }

    async handleGetCharacteristicsMessage(messageid, data) {
        this.respond(messageid, await this.getCharacteristics(...data.ids));
    }

    /**
     * Gets the value of a characteristic.
     */
    getCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.getCharacteristic(...ids)));
    }

    getCharacteristic(accessory_uuid, service_uuid, characteristic_uuid) {
        const service_type = service_uuid.indexOf('.') !== -1 ? service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
        const service_subtype = service_uuid.indexOf('.') !== -1 ? service_uuid.substr(service_uuid.indexOf('.')) : undefined;

        for (let bridge of [this.server.homebridge._bridge]) {
            for (let accessory of [bridge, ...bridge.bridgedAccessories]) {
                const service = accessory.services.find(service => service.UUID === service_type && service.subtype === service_subtype);
                if (!service) return;

                const characteristic = service.characteristics.find(characteristic => characteristic.UUID === characteristic_uuid);
                if (!characteristic) return;

                return characteristic.toHAP()[0];
            }
        }
    }

    async handleSetCharacteristicsMessage(messageid, data) {
        this.respond(messageid, await this.setCharacteristics(...data.ids_data));
    }

    /**
     * Sets the value of a characteristic.
     */
    setCharacteristics(...ids) {
        return Promise.all(ids.map(ids => this.setCharacteristic(...ids)));
    }

    setCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        this.server.log.info('Setting characteristic', accessory_uuid, service_uuid, characteristic_uuid, 'to', value);

        const service_type = service_uuid.indexOf('.') !== -1 ? service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
        const service_subtype = service_uuid.indexOf('.') !== -1 ? service_uuid.substr(service_uuid.indexOf('.')) : undefined;

        for (let bridge of [this.server.homebridge._bridge]) {
            for (let accessory of [bridge, ...bridge.bridgedAccessories]) {
                const service = accessory.services.find(service => service.UUID === service_type && service.subtype === service_subtype);
                if (!service) return;

                const characteristic = service.characteristics.find(characteristic => characteristic.UUID == characteristic_uuid);
                if (!characteristic) return;

                this.server.log.info('Characteristic', characteristic);

                return characteristic.setValue(value);
                // return characteristic.emit('set', value);
            }
        }
    }

    async handleGetAccessoriesDataMessage(messageid, data) {
        this.respond(messageid, await this.getAccessoriesData(...data.id));
    }

    /**
     * Gets the details of accessories.
     * This is stored by the web UI.
     */
    getAccessoriesData(...id) {
        return Promise.all(id.map(id => this.getAccessoryData(id)));
    }

    async getAccessoryData(id) {
        //
        this.server.log.debug('Getting data for accessory', id);

        return await this.server.storage.getItem('AccessoryData.' + id) || {};
    }

    async handleSetAccessoriesDataMessage(messageid, data) {
        this.respond(messageid, await this.setAccessoriesData(...data.id_data));
    }

    /**
     * Sets extra data of accessories.
     * This is stored by the web UI.
     */
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

    async handleGetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, await this.getHomeSettings());
    }

    /**
     * Gets global settings.
     */
    async getHomeSettings() {
        this.server.log.debug('Getting global settings');

        return await this.server.storage.getItem('Home') || {};
    }

    async handleSetHomeSettingsMessage(messageid, data) {
        this.respond(messageid, await this.setHomeSettings(data.data));
    }

    /**
     * Sets global settings.
     */
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
}
