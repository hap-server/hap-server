import EventEmitter from 'events';
import Characteristic from './characteristic';
import {Component} from 'vue';

// Types
import {UIPlugin} from '../public/plugins';

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
    ws: WebSocket | any;
    private messageid = 0;
    private callbacks = new Map<number, (() => void)[]>();
    private authenticated_user: AuthenticatedUser = null;
    open_consoles = new Set<Console>();

    subscribed_characteristics = new Set<Characteristic>();
    subscribe_queue?: any[] = null;
    subscribe_queue_timeout?: NodeJS.Timeout = null;
    unsubscribe_queue?: any[] = null;
    unsubscribe_queue_timeout?: NodeJS.Timeout = null;

    constructor(ws: WebSocket, is_ws: boolean) {
        super();

        this.ws = ws;

        // this.ws.send('something');

        if (is_ws) {
            this.ws.on('message', this.handleData.bind(this));
            this.ws.on('close', this.handleDisconnect.bind(this));
        } else {
            this.ws.onmessage = message => this.handleData(message.data);
            this.ws.onclose = this.handleDisconnect.bind(this);
        }
    }

    static connect(url: string, _WebSocket): Promise<Connection> {
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
                    console.warn('Received progress update for a request with no progress handler');
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

    send(data, progress?: () => void): Promise<any> {
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

    listAccessories(): Promise<string[]> {
        return this.send({
            type: 'list-accessories',
        });
    }

    getAccessories(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-accessories',
            id,
        });
    }

    getAccessoriesPermissions(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-accessories-permissions',
            id,
        });
    }

    getCharacteristics(...ids: {0: string, 1: string, 2: string}[]): Promise<any[]> {
        return this.send({
            type: 'get-characteristics',
            ids,
        });
    }

    getCharacteristic(accessory_uuid: string, service_id: string, characteristic_uuid: string) {
        return this.getCharacteristics([accessory_uuid, service_id, characteristic_uuid]);
    }

    setCharacteristics(...ids_data: {0: string, 1: string, 2: string, 3: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-characteristics',
            ids_data,
        });
    }

    setCharacteristic(accessory_uuid: string, service_id: string, characteristic_id: string, value) {
        return this.setCharacteristics([accessory_uuid, service_id, characteristic_id, value]);
    }

    subscribeCharacteristics(...ids: {0: string, 1: string, 2: string}[]): Promise<any[]> {
        return this.send({
            type: 'subscribe-characteristics',
            ids,
        });
    }

    subscribeCharacteristic(accessory_uuid: string, service_id: string, characteristic_id: string) {
        return this.subscribeCharacteristics([accessory_uuid, service_id, characteristic_id]);
    }

    unsubscribeCharacteristics(...ids: {0: string, 1: string, 2: string}[]): Promise<any[]> {
        return this.send({
            type: 'unsubscribe-characteristics',
            ids,
        });
    }

    unsubscribeCharacteristic(accessory_uuid: string, service_id: string, characteristic_id: string) {
        return this.unsubscribeCharacteristics([accessory_uuid, service_id, characteristic_id]);
    }

    getAccessoriesData(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-accessories-data',
            id,
        });
    }

    setAccessoriesData(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-accessories-data',
            id_data,
        });
    }

    setAccessoryData(id: string, data) {
        return this.setAccessoriesData([id, data]);
    }

    startAccessoryDiscovery() {
        return this.send({
            type: 'start-accessory-discovery',
        });
    }

    getDiscoveredAccessories(): Promise<any[]> {
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

    listLayouts(): Promise<string[]> {
        return this.send({
            type: 'list-layouts',
        });
    }

    createLayouts(...data): Promise<string[]> {
        return this.send({
            type: 'create-layouts',
            data,
        });
    }

    getLayouts(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-layouts',
            id,
        });
    }

    getLayoutsPermissions(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-layouts-permissions',
            id,
        });
    }

    setLayouts(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-layouts',
            id_data,
        });
    }

    setLayout(id: string, data) {
        return this.setLayouts([id, data]);
    }

    deleteLayouts(...id: string[]) {
        return this.send({
            type: 'delete-layouts',
            id,
        });
    }

    listLayoutSections(...id: string[]): Promise<string[][]> {
        return this.send({
            type: 'list-layout-sections',
            id,
        });
    }

    createLayoutSections(...id_data: {
        /** Layout UUID */
        0: string,
        1: any,
    }[]): Promise<string[]> {
        return this.send({
            type: 'create-layout-sections',
            id_data,
        });
    }

    createLayoutSection(layout_uuid: string, data) {
        return this.createLayoutSections([layout_uuid, data]);
    }

    getLayoutSections(...ids: {
        /** Layout UUID */
        0: string,
        /** Layout Section UUID */
        1: string,
    }[]): Promise<any[]> {
        return this.send({
            type: 'get-layout-sections',
            ids,
        });
    }

    getLayoutSection(layout_uuid: string, section_uuid: string) {
        return this.getLayoutSections([layout_uuid, section_uuid]);
    }

    setLayoutSections(...ids_data: {0: string, 1: string, 2: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-layout-sections',
            ids_data,
        });
    }

    setLayoutSection(layout_uuid: string, section_uuid: string, data) {
        return this.setLayoutSections([layout_uuid, section_uuid, data]);
    }

    deleteLayoutSections(...ids: {0: string, 1: string}[]) {
        return this.send({
            type: 'delete-layout-sections',
            ids,
        });
    }

    deleteLayoutSection(layout_uuid, section_id) {
        return this.deleteLayoutSections([layout_uuid, section_id]);
    }

    listAutomations(): Promise<string[]> {
        return this.send({
            type: 'list-automations',
        });
    }

    createAutomations(...data): Promise<string[]> {
        return this.send({
            type: 'create-automations',
            data,
        });
    }

    getAutomations(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-automations',
            id,
        });
    }

    getAutomationsPermissions(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-automations-permissions',
            id,
        });
    }

    setAutomations(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-automations',
            id_data,
        });
    }

    setAutomation(uuid: string, data) {
        return this.setAutomations([uuid, data]);
    }

    deleteAutomations(...id: string[]) {
        return this.send({
            type: 'delete-automations',
            id,
        });
    }

    listScenes(): Promise<string[]> {
        return this.send({
            type: 'list-scenes',
        });
    }

    createScenes(...data): Promise<string[]> {
        return this.send({
            type: 'create-scenes',
            data,
        });
    }

    getScenes(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-scenes',
            id,
        });
    }

    getScenesPermissions(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-scenes-permissions',
            id,
        });
    }

    setScenes(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-scenes',
            id_data,
        });
    }

    setScene(uuid: string, data) {
        return this.setScenes([uuid, data]);
    }

    checkScenesActive(...id: string[]): Promise<boolean[]> {
        return this.send({
            type: 'check-scenes-active',
            id,
        });
    }

    activateScenes(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'activate-scenes',
            id_data,
        });
    }

    activateScene(uuid: string, context?) {
        return this.activateScenes([uuid, context]);
    }

    deactivateScenes(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'deactivate-scenes',
            id_data,
        });
    }

    deactivateScene(uuid: string, context?) {
        return this.deactivateScenes([uuid, context]);
    }

    deleteScenes(...id: string[]) {
        return this.send({
            type: 'delete-scenes',
            id,
        });
    }

    getCommandLineFlags(): Promise<string[]> {
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

    listBridges(include_homebridge = false): Promise<string[]> {
        return this.send({
            type: 'list-bridges',
            include_homebridge,
        });
    }

    createBridges(...data): Promise<string[]> {
        return this.send({
            type: 'create-bridges',
            data,
        });
    }

    getBridges(...uuid: string[]): Promise<any[]> {
        return this.send({
            type: 'get-bridges',
            uuid,
        });
    }

    getBridgesConfiguration(...uuid: string[]): Promise<any[]> {
        return this.send({
            type: 'get-bridges-configuration',
            uuid,
        });
    }

    getBridgesConfigurationPermissions(...uuid: string[]): Promise<any[]> {
        return this.send({
            type: 'get-bridges-permissions',
            uuid,
        });
    }

    setBridgesConfiguration(...uuid_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-bridges-configuration',
            uuid_data,
        });
    }

    setBridgeConfiguration(uuid: string, data) {
        return this.setBridgesConfiguration([uuid, data]);
    }

    deleteBridges(...uuid: string[]) {
        return this.send({
            type: 'delete-bridges',
            uuid,
        });
    }

    getBridgesPairingDetails(...bridge_uuid: string[]) {
        return this.send({
            type: 'get-bridges-pairing-details',
            bridge_uuid,
        });
    }

    resetBridgesPairings(...bridge_uuid: string[]) {
        return this.send({
            type: 'reset-bridges-pairings',
            bridge_uuid,
        });
    }

    listPairings(bridge_uuid: string): Promise<string[]> {
        return this.send({
            type: 'list-pairings',
            bridge_uuid,
        });
    }

    getPairings(...ids: {0: string, 1: string}[]): Promise<any[]> {
        return this.send({
            type: 'get-pairings',
            ids,
        });
    }

    getPairing(bridge_uuid: string, pairing_id: string) {
        return this.getPairings([bridge_uuid, pairing_id]);
    }

    getPairingsData(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-pairings-data',
            id,
        });
    }

    getPairingsPermissions(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-pairings-permissions',
            id,
        });
    }

    setPairingsData(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-pairings-data',
            id_data,
        });
    }

    setPairingData(pairing_id: string, data) {
        return this.setPairingsData([pairing_id, data]);
    }

    getWebInterfacePlugins(): Promise<UIPlugin[]> {
        return this.send({
            type: 'get-web-interface-plugins',
        });
    }

    getAccessoryUIs() {
        return this.getWebInterfacePlugins();
    }

    getUsersPermissions(...id: string[]): Promise<any[]> {
        return this.send({
            type: 'get-users-permissions',
            id,
        });
    }

    setUsersPermissions(...id_data: {0: string, 1: any}[]): Promise<any[]> {
        return this.send({
            type: 'set-users-permissions',
            id_data,
        });
    }

    setUserPermissions(id: string, data) {
        return this.setUsersPermissions([id, data]);
    }

    openConsole(): Promise<number> {
        return this.send({
            type: 'open-console',
        });
    }

    closeConsole(id: number) {
        return this.send({
            type: 'close-console',
            id,
        });
    }

    sendConsoleInput(id: number, data) {
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
    readonly connection: Connection;
    readonly id: number;

    private closing: Promise<void> = null;
    closed = false;

    _handleData;
    _handleDisconnected;

    constructor(connection: Connection, id: number) {
        super();

        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'id', {value: id});

        this._handleData = this.handleData.bind(this);
        this._handleDisconnected = this.handleDisconnected.bind(this);

        this.connection.on('console-output', this._handleData);
        this.connection.on('disconnected', this._handleDisconnected);

        this.connection.open_consoles.add(this);
    }

    handleData(id: number, stream: string, data) {
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
    readonly connection: Connection;
    readonly authentication_handler_id: number;

    constructor(connection: Connection, authentication_handler_id: number) {
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
    authentication_handler_id: number;
    id: string;
    readonly token?: string;
    readonly asset_token?: string;

    constructor(authentication_handler_id: number, id: string) {
        Object.defineProperty(this, 'authentication_handler_id', {value: authentication_handler_id});
        Object.defineProperty(this, 'id', {value: id});
    }
}

export class UserManagementConnection {
    readonly connection: Connection;
    readonly user_management_handler_id: number;

    static component?: Component;

    constructor(connection: Connection, user_management_handler_id: number) {
        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'user_management_handler_id', {value: user_management_handler_id});
    }

    get component() {
        return (this.constructor as typeof UserManagementConnection).component;
    }
    set component(component: Component) {
        Object.defineProperty(this, 'component', {value: component, writable: true});
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

            if (err.error) {
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }
}

export class UserManagementUser {
    readonly user_management_handler: UserManagementConnection;
    readonly id: string;
    readonly component: Component;

    constructor(user_management_handler: UserManagementConnection, id: string, component: Component) {
        Object.defineProperty(this, 'user_management_handler', {value: user_management_handler});
        Object.defineProperty(this, 'id', {configurable: true, writable: true, value: id});
        Object.defineProperty(this, 'component', {value: component || user_management_handler.component ||
            (user_management_handler.constructor as typeof UserManagementConnection).component});
    }
}

export class AccessorySetupConnection {
    readonly connection: Connection;
    readonly accessory_setup_id: number;

    constructor(connection: Connection, accessory_setup_id: number) {
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

            if (err.error) {
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }
}
