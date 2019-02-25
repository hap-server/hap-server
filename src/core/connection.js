let id = 0;

const message_methods = {
    'list-accessories': 'handleListAccessoriesMessage',
    'get-accessories': 'handleGetAccessoriesMessage',
    'get-characteristics': 'handleGetCharacteristicsMessage',
    'get-accessories-data': 'handleGetAccessoriesDataMessage',
    'set-accessories-data': 'handleSetAccessoriesDataMessage',
};

export default class Connection {
    constructor(server, ws) {
        this.server = server;
        this.ws = ws;
        this.id = id++;

        this.server.log.debug('WebSocket connection', this.id, this.ws);

        ws.on('message', message => {
            this.server.log.debug('Received', this.id, message);

            const match = message.match(/^\*([0-9]+)\:(.*)$/);

            if (!match) {
                this.server.log.error('Received invalid message from client', this.id);
                return;
            }

            const messageid = parseInt(match[1]);
            const data = JSON.parse(match[2]);

            this.handleMessage(messageid, data);
        });

        ws.send('ping');
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
        return Promise.all(ids.map(ids => this.getCharacteristic(ids)));
    }

    getCharacteristic(ids) {
        //
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

    getAccessoryData(id) {
        //
        this.server.log.debug('Getting data for accessory', id);

        return this.server.storage.getItem('AccessoryData.' + id);
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

    setAccessoryData(id, data) {
        //
        this.server.log.debug('Setting data for accessory', id, data);

        return this.server.storage.setItem('AccessoryData.' + id, data);
    }
}
