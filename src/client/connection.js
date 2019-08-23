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
    'add-scene': 'handleAddSceneMessage',
    'remove-scene': 'handleRemoveSceneMessage',
    'update-scene': 'handleUpdateSceneMessage',
    'scene-activating': 'handleSceneActivatingMessage',
    'scene-deactivating': 'handleSceneDeactivatingMessage',
    'scene-activated': 'handleSceneActivatedMessage',
    'scene-deactivated': 'handleSceneDeactivatedMessage',
    'scene-progress': 'handleSceneProgressMessage',
    'update-pairings': 'handleUpdatePairingsMessage',
    'update-pairing-data': 'handleUpdatePairingDataMessage',
    'update-permissions': 'handleUpdatePermissionsMessage',
    'stdout': 'handleStdout',
    'stderr': 'handleStderr',
    'console-output': 'handleConsoleOutput',
};

export default class Connection extends EventEmitter {
    constructor(ws, is_ws) {
        super();

        this.ws = ws;
        this.messageid = 0;
        this.callbacks = new Map();
        this.authenticated_user = null;
        this.open_consoles = new Set();

        this.subscribed_characteristics = new Set();
        this.subscribe_queue = null;
        this.subscribe_queue_timeout = null;
        this.unsubscribe_queue = null;
        this.unsubscribe_queue_timeout = null;

        // this.ws.send('something');

        if (is_ws) {
            this.ws.on('message', this.handleData.bind(this));
            this.ws.on('close', this.handleDisconnect.bind(this));
        } else {
            this.ws.onmessage = message => this.handleData(message.data);
            this.ws.onclose = this.handleDisconnect.bind(this);
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

        const match = data.match(/^(\*|!|&)([0-9]+)\:(.*)$/);

        if (match) {
            const type = match[1] === '&' ? 'progress' :
                match[1] === '!' ? 'error' : 'success';
            const messageid = parseInt(match[2]);
            const data = match[3] !== 'undefined' ? JSON.parse(match[3]) : undefined;

            if (!this.callbacks.has(messageid)) {
                console.error('Unknown messageid');
                return;
            }

            const [resolve, reject, progress] = this.callbacks.get(messageid);

            if (type === 'progress') {
                if (!progress) {
                    console.warning('Received progress update for a request with no progress handler');
                } else {
                    progress.call(this, data);
                }

                return;
            }

            if (type === 'error') reject.call(this, data);
            else resolve.call(this, data);

            this.callbacks.delete(messageid);

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

    handleDisconnect(event) {
        this.emit('disconnected', event);

        for (const [, reject] of this.callbacks.values()) {
            reject.call(this, event);
        }
    }

    send(data, progress) {
        return new Promise((resolve, reject) => {
            const messageid = this.messageid++;

            this.ws.send('*' + messageid + ':' + JSON.stringify(data));

            this.callbacks.set(messageid, [resolve, reject, progress]);
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

    subscribeCharacteristics(...ids) {
        return this.send({
            type: 'subscribe-characteristics',
            ids,
        });
    }

    subscribeCharacteristic(accessory_uuid, service_id, characteristic_id) {
        return this.subscribeCharacteristics([accessory_uuid, service_uid, characteristic_id]);
    }

    unsubscribeCharacteristics(...ids) {
        return this.send({
            type: 'unsubscribe-characteristics',
            ids,
        });
    }

    unsubscribeCharacteristic(accessory_uuid, service_id, characteristic_id) {
        return this.unsubscribeCharacteristics([accessory_uuid, service_uid, characteristic_id]);
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

    listScenes() {
        return this.send({
            type: 'list-scenes',
        });
    }

    createScenes(...data) {
        return this.send({
            type: 'create-scenes',
            data,
        });
    }

    getScenes(...id) {
        return this.send({
            type: 'get-scenes',
            id,
        });
    }

    getScenesPermissions(...id) {
        return this.send({
            type: 'get-scenes-permissions',
            id,
        });
    }

    setScenes(...id_data) {
        return this.send({
            type: 'set-scenes',
            id_data,
        });
    }

    setScene(uuid, data) {
        return this.setScenes([uuid, data]);
    }

    checkScenesActive(...id) {
        return this.send({
            type: 'check-scenes-active',
            id,
        });
    }

    activateScenes(...id_data) {
        return this.send({
            type: 'activate-scenes',
            id_data,
        });
    }

    activateScene(uuid, context) {
        return this.activateScenes([uuid, context]);
    }

    deactivateScenes(...id_data) {
        return this.send({
            type: 'deactivate-scenes',
            id_data,
        });
    }

    deactivateScene(uuid, context) {
        return this.deactivateScenes([uuid, context]);
    }

    deleteScenes(...id) {
        return this.send({
            type: 'delete-scenes',
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

    getWebInterfacePlugins() {
        return this.send({
            type: 'get-web-interface-plugins',
        });
    }

    getAccessoryUIs() {
        return this.getWebInterfacePlugins();
    }

    getUsersPermissions(...id) {
        return this.send({
            type: 'get-users-permissions',
            id,
        });
    }

    setUsersPermissions(...id_data) {
        return this.send({
            type: 'set-users-permissions',
            id_data,
        });
    }

    setUserPermissions(id, data) {
        return this.setUsersPermissions([id, data]);
    }

    openConsole() {
        return this.send({
            type: 'open-console',
        });
    }

    closeConsole(id) {
        return this.send({
            type: 'close-console',
            id,
        });
    }

    sendConsoleInput(id, data) {
        return this.send({
            type: 'console-input',
            id,
            data,
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

    handleAddSceneMessage(data) {
        this.emit('add-scene', data.uuid);
    }

    handleRemoveSceneMessage(data) {
        this.emit('remove-scene', data.uuid);
    }

    handleUpdateSceneMessage(data) {
        this.emit('update-scene', data.uuid, data.data);
    }

    handleSceneActivatingMessage(data) {
        this.emit('scene-activating', data.uuid, data.context);
    }

    handleSceneDeactivatingMessage(data) {
        this.emit('scene-deactivating', data.uuid, data.context);
    }

    handleSceneActivatedMessage(data) {
        this.emit('scene-activated', data.uuid, data.context);
    }

    handleSceneDeactivatedMessage(data) {
        this.emit('scene-deactivated', data.uuid, data.context);
    }

    handleSceneProgressMessage(data) {
        this.emit('scene-progress', data.uuid, data.context);
    }

    handleUpdatePairingsMessage(data) {
        this.emit('update-pairings', data.bridge_uuid /* , data.pairings */);
    }

    handleUpdatePairingDataMessage(data) {
        this.emit('update-pairing-data', data.id, data.data);
    }

    handleUpdatePermissionsMessage(data) {
        this.emit('update-home-permissions', data.data);
    }

    handleStdout(data) {
        this.emit('stdout', data.data);
    }

    handleStderr(data) {
        this.emit('stderr', data.data);
    }

    handleConsoleOutput(data) {
        this.emit('console-output', data.id, data.stream, data.data);
    }
}

export class Console extends EventEmitter {
    constructor(connection, id) {
        super();

        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'id', {value: id});

        this._handleData = this.handleData.bind(this);
        this._handleDisconnected = this.handleDisconnected.bind(this);

        this.connection.on('console-output', this._handleData);
        this.connection.on('disconnected', this._handleDisconnected);

        this.connection.open_consoles.add(this);
    }

    handleData(id, stream, data) {
        if (id !== this.id) return;

        if (stream === 'out') this.emit('out', data);
        if (stream === 'err') this.emit('err', data);
    }

    handleDisconnected() {
        this.closing = null;
        this.closed = true;
        this.connection.removeListener('console-output', this._handleData);
        this.connection.removeListener('disconnected', this._handleDisconnected);

        this.connection.open_consoles.delete(this);
    }

    write(data) {
        return this.connection.sendConsoleInput(this.id, data);
    }

    close() {
        if (this.closed) return Promise.resolve();
        if (this.closing) return this.closing;

        return this.closing = this.connection.closeConsole(this.id).then(() => {
            this.handleDisconnected();
        });
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
        try {
            const response = await this.connection.send({
                type: 'authenticate',
                authentication_handler_id: this.authentication_handler_id,
                data,
            });

            if (response.success) {
                const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

                Object.defineProperty(authenticated_user, 'token', {value: response.token});
                Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
                Object.assign(authenticated_user, response.data);

                return authenticated_user;
            }

            return response.data;
        } catch (err) {
            if (typeof err !== 'object' || !err.data) throw err;

            if (err.error) {
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }
}

export class AuthenticatedUser {
    constructor(authentication_handler_id, id) {
        Object.defineProperty(this, 'authentication_handler_id', {value: authentication_handler_id});
        Object.defineProperty(this, 'id', {value: id});
    }
}

export class UserManagementConnection {
    constructor(connection, user_management_handler_id) {
        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'user_management_handler_id', {value: user_management_handler_id});
    }

    /**
     * Send data to an authentication handler on the server.
     *
     * @param {*} data
     * @return {Promise<*>}
     */
    async send(data) {
        try {
            return await this.connection.send({
                type: 'user-management',
                user_management_handler_id: this.user_management_handler_id,
                data,
            });
        } catch (err) {
            if (typeof err !== 'object' || !err.data) throw err;

            if (response.error) {
                const error = new (global[response.constructor] || Error)(response.data.message);
                error.code = response.data.code;
                throw error;
            }

            throw response.data;
        }
    }
}

export class UserManagementUser {
    constructor(user_management_handler, id, component) {
        Object.defineProperty(this, 'user_management_handler', {value: user_management_handler});
        Object.defineProperty(this, 'id', {configurable: true, writable: true, value: id});
        Object.defineProperty(this, 'component', {value: component || user_management_handler.component ||
            user_management_handler.constructor.component});
    }
}

export class AccessorySetupConnection {
    constructor(connection, accessory_setup_id) {
        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'accessory_setup_id', {value: accessory_setup_id});
    }

    /**
     * Send data to an accessory setup handler on the server.
     *
     * @param {*} data
     * @return {Promise<*>}
     */
    async send(data) {
        try {
            return await this.connection.send({
                type: 'accessory-setup',
                accessory_setup_id: this.accessory_setup_id,
                data,
            });
        } catch (err) {
            if (typeof err !== 'object' || !err.data) throw err;

            if (response.error) {
                const error = new (global[response.constructor] || Error)(response.data.message);
                error.code = response.data.code;
                throw error;
            }

            throw response.data;
        }
    }
}
