import EventEmitter from 'events';

const broadcast_message_methods = {
    'add-accessory': 'handleAddAccessoryMessage',
    'remove-accessory': 'handleRemoveAccessoryMessage',
    'update-accessory-details': 'handleUpdateAccessoryDetailsMessage',
    'update-accessory-data': 'handleUpdateAccessoryDataMessage',
    'update-home-settings': 'handleUpdateHomeSettingsMessage',
};

export default class Connection extends EventEmitter {
    constructor(ws) {
        super();

        this.ws = ws;
        this.messageid = 0;
        this.callbacks = new Map();

        // this.ws.send('something');

        this.ws.onmessage = message => {
            // console.log('Received', message);

            if (message.data === 'ping') {
                console.log('Received ping request, sending ping response');
                this.ws.send('pong');
                return;
            }

            const match = message.data.match(/^\*([0-9]+)\:(.*)$/);

            if (match) {
                const messageid = parseInt(match[1]);
                const data = match[2] !== 'undefined' ? JSON.parse(match[2]) : undefined;

                if (!this.callbacks.has(messageid)) {
                    console.error('Unknown messageid');
                    return;
                }

                const callback = this.callbacks.get(messageid);

                callback.call(this, data);

                return;
            }

            const match_broadcast = message.data.match(/^\*\*\:(.*)$/);

            if (match_broadcast) {
                const data = match_broadcast[1] !== 'undefined' ? JSON.parse(match_broadcast[1]) : undefined;

                this.emit('received-broadcast', data);

                this.handleBroadcastMessage(data);

                return;
            }

            console.error('Invalid message');
        };
    }

    static connect(url) {
        return new Promise((resolve, reject) => {
            const default_url = location.protocol.replace('http', 'ws') + '//' + location.host + '/websocket';

            const ws = new WebSocket(url || default_url);

            ws.onopen = () => {
                const connection = new Connection(ws);
                resolve(connection);
            };
        });
    }

    send(data) {
        return new Promise((resolve, reject) => {
            const messageid = this.messageid++;

            this.ws.send('*' + messageid + ':' + JSON.stringify(data));

            this.callbacks.set(messageid, resolve);
        });
    }

    listAccessories(...id) {
        return this.send({
            type: 'list-accessories',
            id,
        });
    }

    getAccessories(...id) {
        return this.send({
            type: 'get-accessories',
            id,
        });
    }

    getCharacteristics(...ids) {
        return this.send({
            type: 'get-characteristics',
            ids,
        });
    }

    getAccessoriesData(...id) {
        return this.send({
            type: 'get-accessories-data',
            id,
        });
    }

    setAccessoriesData(...id_data) {
        return this.send({
            type: 'set-accessories-data',
            id_data,
        });
    }

    setAccessoryData(id, data) {
        return this.setAccessoriesData([id, data]);
    }

    getHomeSettings() {
        return this.send({
            type: 'get-home-settings',
        });
    }

    setHomeSettings(data) {
        return this.send({
            type: 'set-home-settings',
            data,
        });
    }

    handleBroadcastMessage(data) {
        console.log('Received broadcast message', data);

        if (data && data.type && broadcast_message_methods[data.type]) {
            this[broadcast_message_methods[data.type]].call(this, data);
            return;
        }
    }

    handleAddAccessoriesMessage(data) {
        this.emit('add-accessories', data.ids);
    }

    handleRemoveAccessoriesMessage(data) {
        this.emit('remove-accessories', data.ids);
    }

    handleUpdateAccessoryDetailsMessage(data) {
        this.emit('update-accessory-details', data.uuid, data.details);
    }

    handleUpdateAccessoryDataMessage(data) {
        this.emit('update-accessory-data', data.uuid, data.data);
    }

    handleUpdateHomeSettingsMessage(data) {
        this.emit('update-home-settings', data.data);
    }
}
