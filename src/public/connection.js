import EventEmitter from 'events';

const broadcast_message_methods = {
    'add-accessory': 'handleAddAccessoryMessage',
    'remove-accessory': 'handleRemoveAccessoryMessage',
    'update-accessory': 'handleUpdateAccessoryDetailsMessage',
    'update-characteristic': 'handleUpdateCharacteristicMessage',
    'update-accessory-data': 'handleUpdateAccessoryDataMessage',
    'update-home-settings': 'handleUpdateHomeSettingsMessage',
    'update-layout': 'handleUpdateLayoutMessage',
    'stdout': 'handleStdout',
    'stderr': 'handleStderr',
};

export default class Connection extends EventEmitter {
    constructor(ws) {
        super();

        this.ws = ws;
        this.messageid = 0;
        this.callbacks = new Map();
        this.authenticated_user = null;

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

        this.ws.onclose = event => {
            this.emit('disconnected', event);
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

            ws.onerror = event => {
                reject(event);
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

    listAccessories() {
        return this.send({
            type: 'list-accessories',
        });
    }

    getAccessories(...id) {
        return this.send({
            type: 'get-accessories',
            id,
        });
    }

    getAccessoriesPermissions(...id) {
        return this.send({
            type: 'get-accessories-permissions',
            id,
        });
    }

    getCharacteristics(...ids) {
        return this.send({
            type: 'get-characteristics',
            ids,
        });
    }

    setCharacteristics(...ids_data) {
        return this.send({
            type: 'set-characteristics',
            ids_data,
        });
    }

    setCharacteristic(accessory_uuid, service_id, characteristic_id, value) {
        return this.setCharacteristics([accessory_uuid, service_id, characteristic_id, value]);
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

    getHomePermissions() {
        return this.send({
            type: 'get-home-permissions',
        });
    }

    setHomeSettings(data) {
        return this.send({
            type: 'set-home-settings',
            data,
        });
    }

    listLayouts() {
        return this.send({
            type: 'list-layouts',
        });
    }

    getLayouts(...id) {
        return this.send({
            type: 'get-layouts',
            id,
        });
    }

    getLayoutsPermissions(...id) {
        return this.send({
            type: 'get-layouts-permissions',
            id,
        });
    }

    setLayouts(...id_data) {
        return this.send({
            type: 'set-layouts',
            id_data,
        });
    }

    setLayout(id, data) {
        return this.setLayouts([id, data]);
    }

    getCommandLineFlags() {
        return this.send({
            type: 'get-command-line-flags',
        });
    }

    enableProxyStdout() {
        return this.send({
            type: 'enable-proxy-stdout',
        });
    }

    disableProxyStdout() {
        return this.send({
            type: 'disable-proxy-stdout',
        });
    }

    listBridges(include_homebridge) {
        return this.send({
            type: 'list-bridges',
            include_homebridge,
        });
    }

    getBridges(...uuid) {
        return this.send({
            type: 'get-bridges',
            uuid,
        });
    }

    listPairings(bridge_uuid) {
        return this.send({
            type: 'list-pairings',
            bridge_uuid,
        });
    }

    getPairings(...ids) {
        return this.send({
            type: 'get-pairings',
            ids,
        });
    }

    getAccessoryUIs() {
        return this.send({
            type: 'get-accessory-uis',
        });
    }

    handleBroadcastMessage(data) {
        // console.log('Received broadcast message', data);

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

    handleUpdateAccessoryMessage(data) {
        this.emit('update-accessory', data.uuid, data.details);
    }

    handleUpdateCharacteristicMessage(data) {
        this.emit('update-characteristic', data.accessory_uuid, data.service_id, data.characteristic_id, data.details);
    }

    handleUpdateAccessoryDataMessage(data) {
        this.emit('update-accessory-data', data.uuid, data.data);
    }

    handleUpdateHomeSettingsMessage(data) {
        this.emit('update-home-settings', data.data);
    }

    handleUpdateLayoutMessage(data) {
        this.emit('update-layout', data.uuid, data.data);
    }

    handleStdout(data) {
        this.emit('stdout', data.data);
    }

    handleStderr(data) {
        this.emit('stderr', data.data);
    }
}

export class AuthenticationHandlerConnection {
    constructor(connection, authentication_handler_id) {
        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'authentication_handler_id', {value: authentication_handler_id});
    }

    /**
     * Send data to an authentication handler on the server.
     *
     * @param {} data
     * @return {Promise<>}
     */
    async send(data) {
        const response = await this.connection.send({
            type: 'authenticate',
            authentication_handler_id: this.authentication_handler_id,
            data,
        });

        if (response.reject) {
            if (response.error) {
                const error = new (global[response.constructor] || Error)(response.data.message);
                error.code = response.data.code;
                throw error;
            }

            throw response.data;
        }

        if (response.success) {
            const authenticated_user = new AuthenticatedUser(response.authentication_handler_id);

            Object.defineProperty(authenticated_user, 'token', {value: response.token});
            Object.assign(authenticated_user, response.data);

            return authenticated_user;
        }

        return response.data;
    }
}

export class AuthenticatedUser {
    constructor(authentication_handler_id) {
        Object.defineProperty(this, 'authentication_handler_id', {value: authentication_handler_id});
    }
}
