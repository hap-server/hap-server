import EventEmitter from 'events';
import Characteristic from './characteristic';

// Types
import {
    MessageTypes, OptionalDataMessageTypes, DefinedRequestMessages, DefinedResponseMessages, UIPlugin, RequestMessages,
} from '../common/types/messages';
import {
    BroadcastMessage,
    AddAccessoriesMessage, RemoveAccessoriesMessage, UpdateAccessoryMessage, UpdateCharacteristicMessage,
    UpdateAccessoryDataMessage, AddDiscoveredAccessoryMessage, RemoveDiscoveredAccessoryMessage,
    UpdateHomeSettingsMessage,
    AddLayoutMessage, RemoveLayoutMessage, UpdateLayoutMessage,
    AddLayoutSectionMessage, RemoveLayoutSectionMessage, UpdateLayoutSectionMessage,
    AddAutomationMessage, RemoveAutomationMessage, UpdateAutomationMessage,
    AddSceneMessage, RemoveSceneMessage, UpdateSceneMessage,
    SceneActivatedMessage, SceneDeactivatedMessage, SceneActivatingMessage, SceneDeactivatingMessage,
    SceneProgressMessage,
    UpdatePairingsMessage, UpdatePairingDataMessage,
    UpdatePermissionsMessage, StdoutMessage, StderrMessage, ConsoleOutputMessage,
} from '../common/types/broadcast-messages';
import {Home, Scene} from '../common/types/storage';

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

class Connection extends EventEmitter {
    ws: WebSocket | import('ws');
    private messageid = 0;
    private callbacks: Map<number, ((v: any) => void)[]> = new Map();
    private authenticated_user: AuthenticatedUser | null = null;
    open_consoles = new Set<Console>();

    subscribed_characteristics = new Set<Characteristic>();
    subscribe_queue: [
        Characteristic, (value: any) => void | ((value: any) => void)[],
        (reason: any) => void | ((reason: any) => void)[],
    ][] | null = null;
    subscribe_queue_timeout: NodeJS.Timeout | null = null;
    unsubscribe_queue: [
        Characteristic, (value: any) => void | ((value: any) => void)[],
        (reason: any) => void | ((reason: any) => void)[],
    ][] | null = null;
    unsubscribe_queue_timeout: NodeJS.Timeout | null = null;

    constructor(ws: WebSocket | import('ws'), is_ws: boolean) {
        super();

        this.ws = ws;

        // this.ws.send('something');

        if (is_ws) {
            (this.ws as import('ws')).on('message', this.handleData.bind(this));
            (this.ws as import('ws')).on('close', this.handleDisconnect.bind(this));
        } else {
            (this.ws as WebSocket).onmessage = message => this.handleData(message.data);
            (this.ws as WebSocket).onclose = this.handleDisconnect.bind(this);
        }
    }

    static connect(url: string, _WebSocket?: typeof import('ws')): Promise<Connection> {
        return new Promise((resolve, reject) => {
            if (_WebSocket) {
                const ws = new _WebSocket(url || this.getDefaultURL());

                ws.on('open', () => resolve(new Connection(ws, true)));
                ws.on('error', event => reject(event));
            } else {
                const ws = new WebSocket(url || this.getDefaultURL());

                ws.onopen = () => resolve(new Connection(ws, false));
                ws.onerror = event => reject(event);
            }
        });
    }

    static getDefaultURL() {
        return location.protocol.replace('http', 'ws') + '//' + location.host + '/websocket';
    }

    protected handleData(data: string) {
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

            const [resolve, reject, progress] = this.callbacks.get(messageid)!;

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

    protected handleDisconnect(event: CloseEvent): void
    protected handleDisconnect(code: number, reason: string): void
    protected handleDisconnect(event: any) {
        this.emit('disconnected', event);

        for (const [, reject] of this.callbacks.values()) {
            reject.call(this, event);
        }
    }

    send<T extends MessageTypes, R = DefinedRequestMessages[T]>(
        type: T, data: {
            [K in keyof R]: K extends 'type' ? T | undefined : R[K];
        }, progress?: () => void
    ): Promise<DefinedResponseMessages[T]>
    send<T extends OptionalDataMessageTypes>(type: T, progress?: () => void): Promise<DefinedResponseMessages[T]>
    send<T extends MessageTypes>(
        data: DefinedRequestMessages[T], progress?: () => void
    ): Promise<DefinedResponseMessages[T]>
    send(data: DefinedRequestMessages[MessageTypes], progress?: () => void): Promise<any>
    send(
        type: MessageTypes | DefinedRequestMessages[MessageTypes], data?: any | (() => void), progress?: () => void
    ): Promise<any> {
        if (typeof type === 'string') {
            if (typeof data === 'function') [data, progress] = [{type}, data];
            if (!data) data = {type};
            data.type = type;
        } else {
            [data, progress] = [type, data, progress];
        }

        return new Promise((resolve, reject) => {
            const messageid = this.messageid++;

            this.ws.send('*' + messageid + ':' + JSON.stringify(data));

            this.callbacks.set(messageid, progress ? [resolve, reject, progress] : [resolve, reject]);
        });
    }

    async authenticateWithCliToken(cli_token: string) {
        try {
            const response = await this.send('authenticate', {
                cli_token,
            });

            if (response.success) {
                const authenticated_user = new AuthenticatedUser(response.authentication_handler_id!, response.user_id);

                Object.defineProperty(authenticated_user, 'token', {value: response.token});
                Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
                Object.assign(authenticated_user, response.data);

                return authenticated_user;
            }

            throw new Error('CLI authenticate did not return an AuthenticatedUser');
        } catch (err) {
            if (typeof err !== 'object' || !err.data) throw err;

            if (err.error) {
                // @ts-ignore
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }

    listAccessories() {
        return this.send('list-accessories');
    }

    getAccessories(...id: string[]) {
        return this.send('get-accessories', {id});
    }

    getAccessoriesConfiguration(...id: string[]) {
        return this.send('get-accessories-configuration', {id});
    }

    setAccessoriesConfiguration(...id_data: [string, any][]) {
        return this.send('set-accessories-configuration', {id_data});
    }

    getAccessoryPlatformsConfiguration(...id: string[]) {
        return this.send('get-accessory-platforms-configuration', {id});
    }

    setAccessoryPlatformsConfiguration(...id_data: [string, any][]) {
        return this.send('set-accessory-platforms-configuration', {id_data});
    }

    getAccessoriesPermissions(...id: string[]) {
        return this.send('get-accessories-permissions', {id});
    }

    getCharacteristics(...ids: [string, string, string][]) {
        return this.send('get-characteristics', {ids});
    }

    getCharacteristic(accessory_uuid: string, service_id: string, characteristic_uuid: string) {
        return this.getCharacteristics([accessory_uuid, service_id, characteristic_uuid]);
    }

    setCharacteristics(...ids_data: [string, string, string, any][]) {
        return this.send('set-characteristics', {ids_data});
    }

    setCharacteristic(accessory_uuid: string, service_id: string, characteristic_id: string, value: any) {
        return this.setCharacteristics([accessory_uuid, service_id, characteristic_id, value]);
    }

    subscribeCharacteristics(...ids: [string, string, string][]) {
        return this.send('subscribe-characteristics', {ids});
    }

    subscribeCharacteristic(accessory_uuid: string, service_id: string, characteristic_id: string) {
        return this.subscribeCharacteristics([accessory_uuid, service_id, characteristic_id]);
    }

    unsubscribeCharacteristics(...ids: [string, string, string][]) {
        return this.send('unsubscribe-characteristics', {ids});
    }

    unsubscribeCharacteristic(accessory_uuid: string, service_id: string, characteristic_id: string) {
        return this.unsubscribeCharacteristics([accessory_uuid, service_id, characteristic_id]);
    }

    getAccessoriesData(...id: string[]) {
        return this.send('get-accessories-data', {id});
    }

    setAccessoriesData(...id_data: [string, any][]) {
        return this.send('set-accessories-data', {id_data});
    }

    setAccessoryData(id: string, data: any) {
        return this.setAccessoriesData([id, data]);
    }

    startAccessoryDiscovery() {
        return this.send('start-accessory-discovery');
    }

    getDiscoveredAccessories() {
        return this.send('get-discovered-accessories');
    }

    stopAccessoryDiscovery() {
        return this.send('stop-accessory-discovery');
    }

    createAccessories(...data: any[]) {
        return this.send('create-accessories', {data});
    }

    createAccessoryPlatforms(...data: any[]) {
        return this.send('create-accessory-platforms', {data});
    }

    deleteAccessories(...id: any[]) {
        return this.send('delete-accessories', {id});
    }

    deleteAccessoryPlatforms(...id: any[]) {
        return this.send('delete-accessory-platforms', {id});
    }

    getHomeSettings() {
        return this.send('get-home-settings');
    }

    getHomePermissions() {
        return this.send('get-home-permissions');
    }

    setHomeSettings(data: Home) {
        return this.send('set-home-settings', {data});
    }

    listLayouts() {
        return this.send('list-layouts');
    }

    createLayouts(...data: any[]) {
        return this.send('create-layouts', {data});
    }

    getLayouts(...id: string[]) {
        return this.send('get-layouts', {id});
    }

    getLayoutsPermissions(...id: string[]) {
        return this.send('get-layouts-permissions', {id});
    }

    setLayouts(...id_data: [string, any][]) {
        return this.send('set-layouts', {id_data});
    }

    setLayout(id: string, data: any) {
        return this.setLayouts([id, data]);
    }

    deleteLayouts(...id: string[]) {
        return this.send('delete-layouts', {id});
    }

    listLayoutSections(...id: string[]) {
        return this.send('list-layout-sections', {id});
    }

    createLayoutSections(...id_data: [string, any][]) {
        return this.send('create-layout-sections', {id_data});
    }

    createLayoutSection(layout_uuid: string, data: any) {
        return this.createLayoutSections([layout_uuid, data]);
    }

    getLayoutSections(...ids: [
        /** Layout UUID */
        string,
        /** Layout Section UUID */
        string,
    ][]) {
        return this.send('get-layout-sections', {ids});
    }

    getLayoutSection(layout_uuid: string, section_uuid: string) {
        return this.getLayoutSections([layout_uuid, section_uuid]);
    }

    setLayoutSections(...ids_data: [string, string, any][]) {
        return this.send('set-layout-sections', {ids_data});
    }

    setLayoutSection(layout_uuid: string, section_uuid: string, data: any) {
        return this.setLayoutSections([layout_uuid, section_uuid, data]);
    }

    deleteLayoutSections(...ids: [string, string][]) {
        return this.send('delete-layout-sections', {ids});
    }

    deleteLayoutSection(layout_uuid: string, section_id: string) {
        return this.deleteLayoutSections([layout_uuid, section_id]);
    }

    listAutomations() {
        return this.send('list-automations');
    }

    createAutomations(...data: any[]) {
        return this.send('create-automations', {data});
    }

    getAutomations(...id: string[]) {
        return this.send('get-automations', {id});
    }

    getAutomationsPermissions(...id: string[]) {
        return this.send('get-automations-permissions', {id});
    }

    setAutomations(...id_data: [string, any][]) {
        return this.send('set-automations', {id_data});
    }

    setAutomation(uuid: string, data: any) {
        return this.setAutomations([uuid, data]);
    }

    deleteAutomations(...id: string[]) {
        return this.send('delete-automations', {id});
    }

    listScenes() {
        return this.send('list-scenes');
    }

    createScenes(...data: Scene[]) {
        return this.send('create-scenes', {data});
    }

    getScenes(...id: string[]) {
        return this.send('get-scenes', {id});
    }

    getScenesPermissions(...id: string[]) {
        return this.send('get-scenes-permissions', {id});
    }

    setScenes(...id_data: [string, any][]) {
        return this.send('set-scenes', {id_data});
    }

    setScene(uuid: string, data: any) {
        return this.setScenes([uuid, data]);
    }

    checkScenesActive(...id: string[]) {
        return this.send('check-scenes-active', {
            id,
        });
    }

    activateScenes(...id_data: [string, any][]) {
        return this.send('activate-scenes', {id_data});
    }

    activateScene(uuid: string, context?: any) {
        return this.activateScenes([uuid, context]);
    }

    deactivateScenes(...id_data: [string, any][]) {
        return this.send('deactivate-scenes', {id_data});
    }

    deactivateScene(uuid: string, context?: any) {
        return this.deactivateScenes([uuid, context]);
    }

    deleteScenes(...id: string[]) {
        return this.send('delete-scenes', {id});
    }

    getCommandLineFlags() {
        return this.send('get-command-line-flags');
    }

    enableProxyStdout() {
        return this.send('enable-proxy-stdout');
    }

    disableProxyStdout() {
        return this.send('disable-proxy-stdout');
    }

    listBridges(include_homebridge = false) {
        return this.send('list-bridges', {include_homebridge});
    }

    createBridges(...data: any[]) {
        return this.send('create-bridges', {data});
    }

    getBridges(...uuid: string[]) {
        return this.send('get-bridges', {uuid});
    }

    getBridgesConfiguration(...uuid: string[]) {
        return this.send('get-bridges-configuration', {uuid});
    }

    getBridgesConfigurationPermissions(...uuid: string[]) {
        return this.send('get-bridges-permissions', {uuid});
    }

    setBridgesConfiguration(...uuid_data: [string, any][]) {
        return this.send('set-bridges-configuration', {uuid_data});
    }

    setBridgeConfiguration(uuid: string, data: any) {
        return this.setBridgesConfiguration([uuid, data]);
    }

    deleteBridges(...uuid: string[]) {
        return this.send('delete-bridges', {uuid});
    }

    getBridgesPairingDetails(bridge_uuid: string) {
        return this.send('get-bridges-pairing-details', {bridge_uuid});
    }

    resetBridgesPairings(bridge_uuid: string) {
        return this.send('reset-bridges-pairings', {bridge_uuid});
    }

    listPairings(bridge_uuid: string) {
        return this.send('list-pairings', {bridge_uuid});
    }

    getPairings(...ids: [string, string][]) {
        return this.send('get-pairings', {ids});
    }

    getPairing(bridge_uuid: string, pairing_id: string) {
        return this.getPairings([bridge_uuid, pairing_id]);
    }

    getPairingsData(...id: string[]) {
        return this.send('get-pairings-data', {id});
    }

    getPairingsPermissions(...id: string[]) {
        return this.send('get-pairings-permissions', {id});
    }

    setPairingsData(...id_data: [string, any][]) {
        return this.send('set-pairings-data', {id_data});
    }

    setPairingData(pairing_id: string, data: any) {
        return this.setPairingsData([pairing_id, data]);
    }

    getWebInterfacePlugins(): Promise<UIPlugin[]> {
        return this.send('get-web-interface-plugins');
    }

    getAccessoryUIs() {
        return this.getWebInterfacePlugins();
    }

    getUsersPermissions(...id: string[]) {
        return this.send('get-users-permissions', {id});
    }

    setUsersPermissions(...id_data: [string, any][]) {
        return this.send('set-users-permissions', {id_data});
    }

    setUserPermissions(id: string, data: any) {
        return this.setUsersPermissions([id, data]);
    }

    openConsole(): Promise<number> {
        return this.send('open-console');
    }

    closeConsole(id: number) {
        return this.send('close-console', {id});
    }

    sendConsoleInput(id: number, data: string) {
        return this.send('console-input', {id, data});
    }

    protected handleBroadcastMessage(data: BroadcastMessage) {
        // console.log('Received broadcast message', data);

        if (data && data.type && data.type in broadcast_message_methods) {
            // @ts-ignore
            this[broadcast_message_methods[data.type]].call(this, data);
            return;
        }
    }

    protected handleAddAccessoriesMessage(data: AddAccessoriesMessage) {
        this.emit('add-accessories', data.ids);
    }

    protected handleRemoveAccessoriesMessage(data: RemoveAccessoriesMessage) {
        this.emit('remove-accessories', data.ids);
    }

    protected handleUpdateAccessoryMessage(data: UpdateAccessoryMessage) {
        this.emit('update-accessory', data.uuid, data.details);
    }

    protected handleUpdateCharacteristicMessage(data: UpdateCharacteristicMessage) {
        this.emit('update-characteristic', data.accessory_uuid, data.service_id, data.characteristic_id, data.details);
    }

    protected handleUpdateAccessoryDataMessage(data: UpdateAccessoryDataMessage) {
        this.emit('update-accessory-data', data.uuid, data.data);
    }

    protected handleAddDiscoveredAccessoryMessage(data: AddDiscoveredAccessoryMessage) {
        this.emit('add-discovered-accessory', data.plugin, data.accessory_discovery, data.id, data.data);
    }

    protected handleRemoveDiscoveredAccessoryMessage(data: RemoveDiscoveredAccessoryMessage) {
        this.emit('remove-discovered-accessory', data.plugin, data.accessory_discovery, data.id);
    }

    protected handleUpdateHomeSettingsMessage(data: UpdateHomeSettingsMessage) {
        this.emit('update-home-settings', data.data);
    }

    protected handleAddLayoutMessage(data: AddLayoutMessage) {
        this.emit('add-layout', data.uuid);
    }

    protected handleRemoveLayoutMessage(data: RemoveLayoutMessage) {
        this.emit('remove-layout', data.uuid);
    }

    protected handleUpdateLayoutMessage(data: UpdateLayoutMessage) {
        this.emit('update-layout', data.uuid, data.data);
    }

    protected handleAddLayoutSectionMessage(data: AddLayoutSectionMessage) {
        this.emit('add-layout-section', data.layout_uuid, data.uuid);
    }

    protected handleRemoveLayoutSectionMessage(data: RemoveLayoutSectionMessage) {
        this.emit('remove-layout-section', data.layout_uuid, data.uuid);
    }

    protected handleUpdateLayoutSectionMessage(data: UpdateLayoutSectionMessage) {
        this.emit('update-layout-section', data.layout_uuid, data.uuid, data.data);
    }

    protected handleAddAutomationMessage(data: AddAutomationMessage) {
        this.emit('add-automation', data.uuid);
    }

    protected handleRemoveAutomationMessage(data: RemoveAutomationMessage) {
        this.emit('remove-automation', data.uuid);
    }

    protected handleUpdateAutomationMessage(data: UpdateAutomationMessage) {
        this.emit('update-automation', data.uuid, data.data);
    }

    protected handleAddSceneMessage(data: AddSceneMessage) {
        this.emit('add-scene', data.uuid);
    }

    protected handleRemoveSceneMessage(data: RemoveSceneMessage) {
        this.emit('remove-scene', data.uuid);
    }

    protected handleUpdateSceneMessage(data: UpdateSceneMessage) {
        this.emit('update-scene', data.uuid, data.data);
    }

    protected handleSceneActivatingMessage(data: SceneActivatingMessage) {
        this.emit('scene-activating', data.uuid, data.context);
    }

    protected handleSceneDeactivatingMessage(data: SceneDeactivatingMessage) {
        this.emit('scene-deactivating', data.uuid, data.context);
    }

    protected handleSceneActivatedMessage(data: SceneActivatedMessage) {
        this.emit('scene-activated', data.uuid, data.context);
    }

    protected handleSceneDeactivatedMessage(data: SceneDeactivatedMessage) {
        this.emit('scene-deactivated', data.uuid, data.context);
    }

    protected handleSceneProgressMessage(data: SceneProgressMessage) {
        this.emit('scene-progress', data.uuid, data.progress);
    }

    protected handleUpdatePairingsMessage(data: UpdatePairingsMessage) {
        this.emit('update-pairings', data.bridge_uuid /* , data.pairings */);
    }

    protected handleUpdatePairingDataMessage(data: UpdatePairingDataMessage) {
        this.emit('update-pairing-data', data.id, data.data);
    }

    protected handleUpdatePermissionsMessage(data: UpdatePermissionsMessage) {
        this.emit('update-home-permissions', data.data);
    }

    protected handleStdout(data: StdoutMessage) {
        this.emit('stdout', data.data);
    }

    protected handleStderr(data: StderrMessage) {
        this.emit('stderr', data.data);
    }

    protected handleConsoleOutput(data: ConsoleOutputMessage) {
        this.emit('console-output', data.id, data.stream, data.data);
    }
}

type ConnectionEvents = {
    'received-broadcast': (this: Connection, data: BroadcastMessage) => void;
    'disconnected': {
        (this: Connection, event: CloseEvent): void;
        (this: Connection, code: number, reason: string): void;
    };

    'add-accessories': (this: Connection, ids: AddAccessoriesMessage['ids']) => void;
    'remove-accessories': (this: Connection, ids: RemoveAccessoriesMessage['ids']) => void;
    'update-accessory': (this: Connection, uuid: string, details: UpdateAccessoryMessage['details']) => void;
    'update-characteristic': (this: Connection, accessory_uuid: string, service_id: string, characteristic_id: string,
        details: UpdateCharacteristicMessage['details']) => void;
    'update-accessory-data': (this: Connection, uuid: string, data: UpdateAccessoryDataMessage['data']) => void;

    'add-discovered-accessory': (this: Connection, plugin: string, accessory_discovery: number, id: number,
        data: AddDiscoveredAccessoryMessage['data']) => void;
    'remove-discovered-accessory': (this: Connection, plugin: string, accessory_discovery: number, id: number) => void;
    'update-home-settings': (this: Connection, data: UpdateHomeSettingsMessage['data']) => void;

    'add-layout': (this: Connection, uuid: string) => void;
    'remove-layout': (this: Connection, uuid: string) => void;
    'update-layout': (this: Connection, uuid: string, data: UpdateLayoutMessage['data']) => void;
    'add-layout-section': (this: Connection, layout_uuid: string, uuid: string) => void;
    'remove-layout-section': (this: Connection, layout_uuid: string, uuid: string) => void;
    'update-layout-section': (this: Connection, layout_uuid: string, uuid: string,
        data: UpdateLayoutSectionMessage['data']) => void;

    'add-automation': (this: Connection, uuid: string) => void;
    'remove-automation': (this: Connection, uuid: string) => void;
    'update-automation': (this: Connection, uuid: string, data: UpdateAutomationMessage['data']) => void;
    'add-scene': (this: Connection, uuid: string) => void;
    'remove-scene': (this: Connection, uuid: string) => void;
    'update-scene': (this: Connection, uuid: string, data: UpdateSceneMessage['data']) => void;
    'scene-activating': (this: Connection, uuid: string, context: SceneActivatingMessage['context']) => void;
    'scene-deactivating': (this: Connection, uuid: string, context: SceneDeactivatingMessage['context']) => void;
    'scene-activated': (this: Connection, uuid: string, context: SceneActivatedMessage['context']) => void;
    'scene-deactivated': (this: Connection, uuid: string, context: SceneDeactivatedMessage['context']) => void;
    'scene-progress': (this: Connection, uuid: string, progress: SceneProgressMessage['progress']) => void;

    'update-pairings': (this: Connection, bridge_uuid: string) => void;
    'update-pairing-data': (this: Connection, id: string, data: UpdatePairingDataMessage['data']) => void;

    'update-home-permissions': (this: Connection, data: UpdatePermissionsMessage['data']) => void;

    'stdout': (this: Connection, data: string) => void;
    'stderr': (this: Connection, data: string) => void;

    'console-output': (this: Connection, id: number, stream: ConsoleOutputMessage['stream'], data: string) => void;
};

interface Connection {
    addListener<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    on<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    once<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    prependListener<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    prependOnceListener<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    removeListener<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    off<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): this;
    removeAllListeners<E extends keyof ConnectionEvents>(event: E): this;
    listeners<E extends keyof ConnectionEvents>(event: E): ConnectionEvents[E][];
    rawListeners<E extends keyof ConnectionEvents>(event: E): ConnectionEvents[E][];

    emit<E extends keyof ConnectionEvents>(event: E, ...data: any[]): boolean;

    eventNames(): (keyof ConnectionEvents)[];
    listenerCount<E extends keyof ConnectionEvents>(type: E): number;
}

export default Connection;

class Console extends EventEmitter {
    readonly connection!: Connection;
    readonly id!: number;

    private closing: Promise<void> | null = null;
    closed = false;

    _handleData: any;
    _handleDisconnected: any;

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

    protected handleData(id: number, stream: ConsoleOutputMessage['stream'], data: string) {
        if (id !== this.id) return;

        if (stream === 'out') this.emit('out', data);
        if (stream === 'err') this.emit('err', data);
    }

    protected handleDisconnected() {
        this.closing = null;
        this.closed = true;
        this.connection.removeListener('console-output', this._handleData);
        this.connection.removeListener('disconnected', this._handleDisconnected);

        this.connection.open_consoles.delete(this);
    }

    write(data: string) {
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

interface Console {
    addListener(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    on(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    once(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    prependListener(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    prependOnceListener(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    removeListener(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    off(event: 'out' | 'err', listener: (this: Console, data: string) => void): this;
    removeAllListeners(event: 'out' | 'err'): this;
    emit(event: 'out' | 'err', data: string): boolean;
}

export {Console};

export class AuthenticationHandlerConnection {
    readonly connection!: Connection;
    readonly authentication_handler_id!: number;

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
    async send(data: any) {
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
                // @ts-ignore
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }
}

export class AuthenticatedUser {
    authentication_handler_id!: number;
    id!: string;
    readonly token?: string;
    readonly asset_token?: string;

    constructor(authentication_handler_id: number, id: string) {
        Object.defineProperty(this, 'authentication_handler_id', {value: authentication_handler_id});
        Object.defineProperty(this, 'id', {value: id});
    }
}

export class UserManagementConnection {
    readonly connection!: Connection;
    readonly user_management_handler_id!: number;

    static component?: any;

    constructor(connection: Connection, user_management_handler_id: number) {
        Object.defineProperty(this, 'connection', {value: connection});
        Object.defineProperty(this, 'user_management_handler_id', {value: user_management_handler_id});
    }

    get component() {
        return (this.constructor as typeof UserManagementConnection).component;
    }
    set component(component: any) {
        Object.defineProperty(this, 'component', {value: component, writable: true});
    }

    /**
     * Send data to an authentication handler on the server.
     *
     * @param {*} data
     * @return {Promise<*>}
     */
    async send(data: any) {
        try {
            return await this.connection.send({
                type: 'user-management',
                user_management_handler_id: this.user_management_handler_id,
                data,
            });
        } catch (err) {
            if (typeof err !== 'object' || !err.data) throw err;

            if (err.error) {
                // @ts-ignore
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }
}

export class UserManagementUser {
    readonly user_management_handler!: UserManagementConnection;
    readonly id!: string;
    readonly component: any;

    constructor(user_management_handler: UserManagementConnection, id: string, component?: any) {
        Object.defineProperty(this, 'user_management_handler', {value: user_management_handler});
        Object.defineProperty(this, 'id', {configurable: true, writable: true, value: id});
        Object.defineProperty(this, 'component', {value: component || user_management_handler.component ||
            (user_management_handler.constructor as typeof UserManagementConnection).component});
    }
}

export class AccessorySetupConnection {
    readonly connection!: Connection;
    readonly accessory_setup_id!: number;

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
    async send(data: any) {
        try {
            return await this.connection.send({
                type: 'accessory-setup',
                accessory_setup_id: this.accessory_setup_id,
                data,
            });
        } catch (err) {
            if (typeof err !== 'object' || !err.data) throw err;

            if (err.error) {
                // @ts-ignore
                const error = new (global[err.constructor] || Error)(err.data.message);
                error.code = err.data.code;
                throw error;
            }

            throw err.data;
        }
    }
}
