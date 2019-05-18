import EventEmitter from 'events';

const broadcast_message_methods = {
    'add-accessory': 'handleAddAccessoryMessage',
    'remove-accessory': 'handleRemoveAccessoryMessage',
    'update-accessory': 'handleUpdateAccessoryDetailsMessage',
    'update-characteristic': 'handleUpdateCharacteristicMessage',
    'update-accessory-data': 'handleUpdateAccessoryDataMessage',
    'add-discovered-accessory': 'handleAddDiscoveredAccessoryMessage',
    'remove-discovered-accessory': 'handleRemoveDiscoveredAccessoryMessage',
    'update-home-settings': 'handleUpdateHomeSettingsMessage',
    'add-layout': 'handleAddLayoutMessage',
    'remove-layout': 'handleRemoveLayoutMessage',
    'update-layout': 'handleUpdateLayoutMessage',
    'add-layout-section': 'handleAddLayoutSectionMessage',
    'remove-layout-section': 'handleRemoveLayoutSectionMessage',
    'update-layout-section': 'handleUpdateLayoutSectionMessage',
    'add-automation': 'handleAddAutomationMessage',
    'remove-automation': 'handleRemoveAutomationMessage',
    'update-automation': 'handleUpdateAutomationMessage',
    'update-pairing-data': 'handleUpdatePairingData',
    'stdout': 'handleStdout',
    'stderr': 'handleStderr',
};

export default class Connection extends EventEmitter {
    constructor(ws, is_ws) {
        super();

        this.ws = ws;
        this.messageid = 0;
        this.callbacks = new Map();
        this.authenticated_user = null;

        // this.ws.send('something');

        if (is_ws) {
            this.ws.on('message', this.handleData.bind(this));
            this.ws.on('close', event => this.emit('disconnected', event));
        } else {
            this.ws.onmessage = message => this.handleData(message.data);
            this.ws.onclose = event => this.emit('disconnected', event);
        }
    }

    static connect(url, _WebSocket) {
        return new Promise((resolve, reject) => {
            const ws = new (_WebSocket || WebSocket)(url || this.getDefaultURL());

            if (_WebSocket) {
                ws.on('open', () => resolve(new Connection(ws, true)));
                ws.on('error', event => reject(event));
            } else {
                ws.onopen = () => resolve(new Connection(ws, false));
                ws.onerror = event => reject(event);
            }
        });
    }

    static getDefaultURL() {
        return location.protocol.replace('http', 'ws') + '//' + location.host + '/websocket';
    }

    handleData(data) {
        // console.log('Received', message);

        if (data === 'ping') {
            console.log('Received ping request, sending ping response');
            this.ws.send('pong');
            return;
        }

        const match = data.match(/^\*([0-9]+)\:(.*)$/);

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

        const match_broadcast = data.match(/^\*\*\:(.*)$/);

        if (match_broadcast) {
            const data = match_broadcast[1] !== 'undefined' ? JSON.parse(match_broadcast[1]) : undefined;

            this.emit('received-broadcast', data);

            this.handleBroadcastMessage(data);

            return;
        }

        console.error('Invalid message');
    }

    send(data) {
        return new Promise((resolve, reject) => {
            const messageid = this.messageid++;

            this.ws.send('*' + messageid + ':' + JSON.stringify(data));

            this.callbacks.set(messageid, resolve);
        });
    }

    async authenticateWithCliToken(cli_token) {
        const response = await this.send({
            type: 'authenticate',
            cli_token,
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
            const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

            Object.defineProperty(authenticated_user, 'token', {value: response.token});
            Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
            Object.assign(authenticated_user, response.data);

            return authenticated_user;
        }

        throw new Error('CLI authenticate did not return an AuthenticatedUser');
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

    startAccessoryDiscovery() {
        return this.send({
            type: 'start-accessory-discovery',
        });
    }

    getDiscoveredAccessories() {
        return this.send({
            type: 'get-discovered-accessories',
        });
    }

    stopAccessoryDiscovery() {
        return this.send({
            type: 'stop-accessory-discovery',
        });
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

    createLayouts(...data) {
        return this.send({
            type: 'create-layouts',
            data,
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

    deleteLayouts(...id) {
        return this.send({
            type: 'delete-layouts',
            id,
        });
    }

    listLayoutSections(...id) {
        return this.send({
            type: 'list-layout-sections',
            id,
        });
    }

    createLayoutSections(...id_data) {
        return this.send({
            type: 'create-layout-sections',
            id_data,
        });
    }

    createLayoutSection(layout_uuid, data) {
        return this.createLayoutSections([layout_uuid, data]);
    }

    getLayoutSections(...ids) {
        return this.send({
            type: 'get-layout-sections',
            ids,
        });
    }

    getLayoutSection(layout_uuid, section_id) {
        return this.getLayoutSection([layout_uuid, section_id]);
    }

    setLayoutSections(...ids_data) {
        return this.send({
            type: 'set-layout-sections',
            ids_data,
        });
    }

    setLayoutSection(layout_uuid, section_id, data) {
        return this.setLayoutSections([layout_uuid, section_id, data]);
    }

    deleteLayoutSections(...ids) {
        return this.send({
            type: 'delete-layout-sections',
            ids,
        });
    }

    deleteLayoutSection(layout_uuid, section_id) {
        return this.deleteLayoutSections([layout_uuid, section_id]);
    }

    listAutomations() {
        return this.send({
            type: 'list-automations',
        });
    }

    createAutomations(...data) {
        return this.send({
            type: 'create-automations',
            data,
        });
    }

    getAutomations(...id) {
        return this.send({
            type: 'get-automations',
            id,
        });
    }

    getAutomationsPermissions(...id) {
        return this.send({
            type: 'get-automations-permissions',
            id,
        });
    }

    setAutomations(...id_data) {
        return this.send({
            type: 'set-automations',
            id_data,
        });
    }

    setAutomation(uuid, data) {
        return this.setAutomations([uuid, data]);
    }

    deleteAutomations(...id) {
        return this.send({
            type: 'delete-automations',
            id,
        });
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

    createBridges(...data) {
        return this.send({
            type: 'create-bridges',
            data,
        });
    }

    getBridges(...uuid) {
        return this.send({
            type: 'get-bridges',
            uuid,
        });
    }

    getBridgesConfiguration(...uuid) {
        return this.send({
            type: 'get-bridges-configuration',
            uuid,
        });
    }

    getBridgesConfigurationPermissions(...uuid) {
        return this.send({
            type: 'get-bridges-permissions',
            uuid,
        });
    }

    setBridgesConfiguration(...uuid_data) {
        return this.send({
            type: 'set-bridges-configuration',
            uuid_data,
        });
    }

    setBridgeConfiguration(uuid, data) {
        return this.setBridgesConfiguration([uuid, data]);
    }

    deleteBridges(...uuid) {
        return this.send({
            type: 'delete-bridges',
            uuid,
        });
    }

    getBridgesPairingDetails(...bridge_uuid) {
        return this.send({
            type: 'get-bridges-pairing-details',
            bridge_uuid,
        });
    }

    resetBridgesPairings(...bridge_uuid) {
        return this.send({
            type: 'reset-bridges-pairings',
            bridge_uuid,
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

    getPairingsData(...id) {
        return this.send({
            type: 'get-pairings-data',
            id,
        });
    }

    getPairingsPermissions(...id) {
        return this.send({
            type: 'get-pairings-permissions',
            id,
        });
    }

    setPairingsData(...id_data) {
        return this.send({
            type: 'set-pairings-data',
            id_data,
        });
    }

    setPairingData(id, data) {
        return this.setPairingsData([id, data]);
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

    handleAddDiscoveredAccessoryMessage(data) {
        this.emit('add-discovered-accessory', data.plugin, data.accessory_discovery, data.id, data.data);
    }

    handleRemoveDiscoveredAccessoryMessage(data) {
        this.emit('remove-discovered-accessory', data.plugin, data.accessory_discovery, data.id);
    }

    handleUpdateHomeSettingsMessage(data) {
        this.emit('update-home-settings', data.data);
    }

    handleAddLayoutMessage(data) {
        this.emit('add-layout', data.uuid);
    }

    handleRemoveLayoutMessage(data) {
        this.emit('remove-layout', data.uuid);
    }

    handleUpdateLayoutMessage(data) {
        this.emit('update-layout', data.uuid, data.data);
    }

    handleAddLayoutSectionMessage(data) {
        this.emit('add-layout-section', data.layout_uuid, data.uuid);
    }

    handleRemoveLayoutSectionMessage(data) {
        this.emit('remove-layout-section', data.layout_uuid, data.uuid);
    }

    handleUpdateLayoutSectionMessage(data) {
        this.emit('update-layout-section', data.layout_uuid, data.uuid, data.data);
    }

    handleAddAutomationMessage(data) {
        this.emit('add-automation', data.uuid);
    }

    handleRemoveAutomationMessage(data) {
        this.emit('remove-automation', data.uuid);
    }

    handleUpdateAutomationMessage(data) {
        this.emit('update-automation', data.uuid, data.data);
    }

    handleUpdatePairingData(data) {
        this.emit('update-pairing-data', data.id, data.data);
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
     * @param {*} data
     * @return {Promise<*>}
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
            const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

            Object.defineProperty(authenticated_user, 'token', {value: response.token});
            Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
            Object.assign(authenticated_user, response.data);

            return authenticated_user;
        }

        return response.data;
    }
}

export class AuthenticatedUser {
    constructor(authentication_handler_id, id) {
        Object.defineProperty(this, 'authentication_handler_id', {value: authentication_handler_id});
        Object.defineProperty(this, 'id', {value: id});
    }
}
