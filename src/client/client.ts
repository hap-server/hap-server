import {TypedEmitter} from 'tiny-typed-emitter';

import Connection, {Console} from './connection';
import Accessory from './accessory';
import Service from './service';
import Characteristic from './characteristic';
import Layout from './layout';
import Automation from './automation';
import Scene from './scene';

import {GetHomePermissionsResponseMessage} from '../common/types/messages';
import {BroadcastMessage} from '../common/types/broadcast-messages';
import {Home} from '../common/types/storage';
import {SystemInformationData} from '../server/system-information';

import ComponentRegistry from '../common/component-registry';

export function $set<T>(object: any, key: string, value: T): T {
    try {
        // @ts-ignore
        if (require.cache[require.resolveWeak('vue')]) {
            const {default: Vue} = require('vue');

            return Vue.set(object, key, value);
        }
    } catch (err) {}

    return object[key] = value;
}

export function $delete(object: any, key: string) {
    try {
        if (require.cache[require.resolve('vue')]) {
            const {default: Vue} = require('vue');

            return Vue.delete(object, key);
        }
    } catch (err) {}

    delete object[key];
}

export default class Client extends TypedEmitter<ClientEvents> {
    readonly url: string;
    connection: Connection | null = null;
    connected = false;
    connect_error: Error | null = null;
    WebSocket: typeof import('ws') | undefined;
    is_ws: boolean;

    private service_components: ComponentRegistry<unknown, any> | null = null;

    home_settings: Home | null = null;
    accessories: {[key: string]: Accessory} | null = null;
    layouts: {[key: string]: Layout} | null = null;
    automations: {[key: string]: Automation} | null = null;
    scenes: {[key: string]: Scene} | null = null;
    system_information: SystemInformationData | null = null;

    loading_home_settings = false;
    loading_accessories = false;
    loading_layouts = false;
    loading_automations = false;
    loading_scenes = false;
    loading_system_information = false;

    private home_settings_dependencies = new Set<any>();
    private accessories_dependencies = new Map<any, string[] | boolean>();
    private layouts_dependencies = new Map<any, string[] | boolean>();
    private automations_dependencies = new Map<any, string[] | boolean>();
    private scenes_dependencies = new Map<any, string[] | boolean>();
    private system_information_dependencies = new Set<any>();

    private _handleBroadcastMessage: any;
    private _handleDisconnected: any;

    private _connect: Promise<Connection> | null = null;
    private _disconnect: Promise<void> | null = null;
    old_connection: Connection | null = null;

    constructor(url?: string, _WebSocket?: typeof import('ws'), service_components?: ComponentRegistry<unknown, any>) {
        super();

        // @ts-ignore
        global.client = this;

        this.url = url ?? Connection.getDefaultURL();
        this.WebSocket = _WebSocket;
        this.is_ws = !!_WebSocket;

        this.service_components = service_components ?? null;

        this._handleBroadcastMessage = this.handleBroadcastMessage.bind(this);
        this._handleDisconnected = this.handleDisconnected.bind(this);

        // this.on('updated-accessories', (added, removed) => console.log('Updated accessories', added, removed));
        // this.on('updated-layouts', (added, removed) => console.log('Updated layouts', added, removed));
    }

    restoreCachedData(data_json: string) {
        const data = JSON.parse(data_json);

        if (data.accessories) {
            if (!this.accessories) this.accessories = {};
            for (const accessory_data of data.accessories) {
                if (this.accessories && this.accessories[accessory_data.uuid]) continue;

                const accessory = new Accessory(this.connection!, accessory_data.uuid, accessory_data.details,
                    accessory_data.data, accessory_data.permissions, accessory_data.status ?? 0,
                    this.service_components
                );

                $set(this.accessories, accessory.uuid, accessory);
            }
        }
        if (data.layouts) {
            if (!this.layouts) this.layouts = {};
            for (const layout_data of data.layouts) {
                if (this.layouts && this.layouts[layout_data.uuid]) continue;

                const layout = new Layout(
                    this.connection!, layout_data.uuid, layout_data.data, layout_data.sections, layout_data.permissions
                );

                $set(this.layouts, layout.uuid, layout);
            }
        }
        if (data.automations) {
            if (!this.automations) this.automations = {};
            for (const automation_data of data.automations) {
                if (this.automations && this.automations[automation_data.uuid]) continue;

                const automation = new Automation(
                    this.connection!, automation_data.uuid, automation_data.data, automation_data.permissions);

                $set(this.automations, automation.uuid, automation);
            }
        }
        if (data.scenes) {
            if (!this.scenes) this.scenes = {};
            for (const scene_data of data.scenes) {
                if (this.scenes && this.scenes[scene_data.uuid]) continue;

                const scene = new Scene(
                    this.connection!, scene_data.uuid, scene_data.data, false, scene_data.permissions);

                $set(this.scenes, scene.uuid, scene);
            }
        }
    }

    updateCachedData() {
        if (!this.listenerCount('cached-data')) return;

        const data = {} as any;

        if (this.accessories) {
            data.accessories = [];
            for (const accessory of Object.values(this.accessories)) {
                data.accessories.push({
                    uuid: accessory.uuid,
                    details: accessory.details,
                    data: accessory.data,
                    // @ts-ignore
                    permissions: accessory._permissions,
                    status: accessory.status,
                });
            }
        }
        if (this.layouts) {
            data.layouts = [];
            for (const layout of Object.values(this.layouts)) {
                const sections = {} as any;

                for (const section of Object.values(layout.sections)) {
                    sections[section.uuid] = section.data;
                }

                data.layouts.push({
                    uuid: layout.uuid,
                    data: layout.data,
                    sections,
                    // @ts-ignore
                    permissions: layout._permissions,
                });
            }
        }
        if (this.automations) {
            data.automations = [];
            for (const automation of Object.values(this.automations)) {
                data.automations.push({
                    uuid: automation.uuid,
                    data: automation.data,
                    // @ts-ignore
                    permissions: automation._permissions,
                });
            }
        }
        if (this.scenes) {
            data.scenes = [];
            for (const scene of Object.values(this.scenes)) {
                data.scenes.push({
                    uuid: scene.uuid,
                    data: scene.data,
                    active: scene.active,
                    // @ts-ignore
                    permissions: scene._permissions,
                });
            }
        }

        this.emit('cached-data', JSON.stringify(data));
    }

    /**
     * Connects to the server.
     *
     * @return {Promise<Connection>}
     */
    connect() {
        if (this.connection) return Promise.resolve(this.connection);
        if (this._connect) return this._connect;

        this.connect_error = null;

        return this._connect = Connection.connect(this.url, this.WebSocket).then(connection => {
            this.connection = connection;

            for (const accessory of Object.values(this.accessories || {})) {
                accessory.connection = connection;

                // Resubscribe to any characteristics
                for (const service of Object.values(accessory.services) as Service[]) {
                    for (const characteristic of Object.values(service.characteristics) as Characteristic[]) {
                        if (!characteristic.subscription_dependencies.size) continue;

                        characteristic.subscribe();
                    }
                }
            }
            for (const layout of Object.values(this.layouts || {})) {
                layout.connection = connection;
            }
            for (const automation of Object.values(this.automations || {})) {
                automation.connection = connection;
            }
            for (const scene of Object.values(this.scenes || {})) {
                scene.connection = connection;
            }

            // Resubscribe to system information
            // if (this.system_information_dependencies.size) {
            //     connection.subscribeSystemInformation();
            // }

            connection.on('received-broadcast', this._handleBroadcastMessage);
            connection.on('disconnected', this._handleDisconnected);

            this.emit('connected', connection);

            return connection;
        }).then(connection => {
            this.connected = true;
            this._connect = null;
            return connection;
        }, err => {
            this.connected = false;
            this.connect_error = err;
            this._connect = null;
            throw err;
        });
    }

    async tryConnect() {
        while (!this.connection) {
            console.log('Trying to connect');

            try {
                await this.connect();
                break;
            } catch (err) {
                console.error('Connect error', err);
            }

            await new Promise(r => setTimeout(r, 4000));
        }
    }

    refreshLoaded() {
        return Promise.all([
            this.accessories ? this.refreshAccessories() : null,
            this.layouts ? this.refreshLayouts() : null,
            this.automations ? this.refreshAutomations() : null,
            this.scenes ? this.refreshScenes() : null,
            this.system_information || this.system_information_dependencies.size ?
                this.refreshSystemInformation() : null,
        ]).then(() => {
            this.updateCachedData();
        });
    }

    /**
     * Disconnects from the server.
     *
     * @return {Promise}
     */
    async disconnect() {
        if (!this.connection) return;
        const connection = this.old_connection = this.connection;
        this.connection = null;
        this.connected = false;

        const disconnect = this._disconnect = (this._disconnect || Promise.resolve()).then(() => {
            connection.removeListener('received-broadcast', this._handleBroadcastMessage);
            connection.removeListener('disconnected', this._handleDisconnected);

            connection.ws.close();

            this.emit('disconnected');
        }).then(() => {
            if (this._disconnect === disconnect) this._disconnect = null;
        }, err => {
            if (this._disconnect === disconnect) this._disconnect = null;
            throw err;
        });

        return disconnect;
    }

    protected async handleBroadcastMessage(data: BroadcastMessage) {
        this.emit('received-broadcast', data);

        if (data.type === 'update-permissions') {
            const accessory_uuids = Object.values(this.accessories || {}).map(a => a.uuid);
            if (accessory_uuids.length) {
                this.connection!.getAccessoriesPermissions(...accessory_uuids).then(accessories_permissions => {
                    for (const index in accessory_uuids) { // eslint-disable-line guard-for-in
                        const uuid = accessory_uuids[index];
                        const accessory = this.accessories![uuid];
                        const permissions = accessories_permissions[index];

                        accessory._setPermissions(permissions || {});
                    }
                });
            }

            const layout_uuids = Object.values(this.layouts || {}).map(l => l.uuid);
            if (layout_uuids.length) {
                this.connection!.getLayoutsPermissions(...layout_uuids).then(layouts_permissions => {
                    for (const index in layout_uuids) { // eslint-disable-line guard-for-in
                        const uuid = layout_uuids[index];
                        const layout = this.layouts![uuid];
                        const permissions = layouts_permissions[index];

                        layout._setPermissions(permissions || {});
                    }
                });
            }

            const scene_uuids = Object.values(this.scenes || {}).map(s => s.uuid);
            if (scene_uuids.length) {
                this.connection!.getScenesPermissions(...scene_uuids).then(scenes_permissions => {
                    for (const index in scene_uuids) { // eslint-disable-line guard-for-in
                        const uuid = scene_uuids[index];
                        const scene = this.scenes![uuid];
                        const permissions = scenes_permissions[index];

                        scene._setPermissions(permissions || {
                            get: false, activate: false, set: false, delete: false,
                        });
                    }
                });
            }

            this.emit('update-home-permissions', data.data);
        }

        if (this.home_settings && data.type === 'update-home-settings') {
            this.home_settings.name = data.data.name;
            this.home_settings.background_url = data.data.background_url;

            this.emit('update-home-settings', this.home_settings);
        }

        if (this.accessories && data.type === 'add-accessories') {
            const accessory_uuids = data.ids.filter(uuid => !this.accessories![uuid]);
            if (!accessory_uuids.length) return;

            const [accessory_details, accessory_data, accessory_permissions, accessory_status] = await Promise.all([
                this.connection!.getAccessories(...accessory_uuids),
                this.connection!.getAccessoriesData(...accessory_uuids),
                this.connection!.getAccessoriesPermissions(...accessory_uuids),
                this.connection!.getAccessoriesStatus(...accessory_uuids),
            ]);

            const accessories = accessory_uuids.map((uuid, index) => new Accessory(this.connection!, uuid,
                accessory_details[index], accessory_data[index], accessory_permissions[index], accessory_status[index],
                this.service_components
            ));

            for (const accessory of accessories) {
                $set(this.accessories, accessory.uuid, accessory);
                this.emit('new-accessory', accessory);
            }

            this.emit('new-accessories', accessories);
            this.emit('updated-accessories', accessories, []);
        }

        if (this.accessories && data.type === 'remove-accessories') {
            const accessory_uuids = data.ids.filter(uuid => this.accessories![uuid]);
            if (!accessory_uuids.length) return;

            const accessories = accessory_uuids.map(uuid => this.accessories![uuid]);

            for (const accessory of accessories) {
                $delete(this.accessories, accessory.uuid);
                this.emit('removed-accessory', accessory);
            }

            this.emit('removed-accessories', accessories);
            this.emit('updated-accessories', [], accessories);
        }

        if (this.accessories && data.type === 'update-accessory') {
            const accessory = this.accessories[data.uuid];
            if (!accessory) return;

            accessory._setDetails(data.details);
        }

        if (this.accessories && data.type === 'update-accessory-status') {
            const accessory = this.accessories[data.uuid];
            if (!accessory) return;

            accessory._setStatus(data.status);
        }

        if (this.accessories && data.type === 'update-accessory-data') {
            const accessory = this.accessories[data.uuid];
            if (!accessory) return;

            accessory._setData(data.data);
        }

        if (this.accessories && data.type === 'update-characteristic') {
            const accessory = this.accessories[data.accessory_uuid];
            if (!accessory) return;
            const service = accessory.findService(s => s.uuid === data.service_id);
            if (!service) return;
            const characteristic = service.findCharacteristic(c => c.uuid === data.characteristic_id);
            if (!characteristic) return;

            characteristic._setDetails(data.details);
        }

        if (this.layouts && data.type === 'add-layout') {
            if (this.layouts[data.uuid]) return;

            const [[layout_data], [layout_permissions]] = await Promise.all([
                this.connection!.getLayouts(data.uuid),
                this.connection!.getLayoutsPermissions(data.uuid),
            ]);

            const layout = new Layout(this.connection!, data.uuid, layout_data, {}, layout_permissions);

            $set(this.layouts, layout.uuid, layout);
            this.emit('new-layout', layout);
            this.emit('new-layouts', [layout]);
            this.emit('updated-layouts', [layout], []);
        }

        if (this.layouts && data.type === 'remove-layout') {
            const layout = this.layouts[data.uuid];
            if (!layout) return;

            $delete(this.layouts, layout.uuid);
            this.emit('removed-layout', layout);
            this.emit('removed-layouts', [layout]);
            this.emit('updated-layouts', [], [layout]);
        }

        if (this.layouts && data.type === 'update-layout') {
            const layout = this.layouts[data.uuid];
            if (!layout) return;

            layout._setData(data.data);
        }

        if (this.layouts && data.type === 'add-layout-section') {
            const layout = this.layouts[data.layout_uuid];
            if (!layout) return;

            const [layout_data] = await this.connection!.getLayoutSection(data.layout_uuid, data.uuid);

            layout._handleNewLayoutSection(data.uuid, layout_data);
        }

        if (this.layouts && data.type === 'remove-layout-section') {
            const layout = this.layouts[data.layout_uuid];
            if (!layout) return;

            layout._handleRemoveLayoutSection(data.uuid);
        }

        if (this.layouts && data.type === 'update-layout-section') {
            const layout = this.layouts[data.layout_uuid];
            if (!layout) return;

            const section = layout.sections[data.uuid];

            section._setData(data.data);
        }

        if (this.automations && data.type === 'add-automation') {
            if (this.automations[data.uuid]) return;

            const [[automation_data], [permissions]] = await Promise.all([
                this.connection!.getAutomations(data.uuid),
                this.connection!.getAutomationsPermissions(data.uuid),
            ]);

            const automation = new Automation(this.connection!, data.uuid, automation_data, permissions);

            $set(this.automations, automation.uuid, automation);
            this.emit('new-automation', automation);
            this.emit('new-automations', [automation]);
            this.emit('updated-automations', [automation], []);
        }

        if (this.automations && data.type === 'remove-automation') {
            const automation = this.automations[data.uuid];
            if (!automation) return;

            $delete(this.automations, automation.uuid);
            this.emit('removed-automation', automation);
            this.emit('removed-automations', [automation]);
            this.emit('updated-automations', [], [automation]);
        }

        if (this.automations && data.type === 'update-automation') {
            const automation = this.automations[data.uuid];
            if (!automation) return;

            automation._setData(data.data);
        }

        if (this.automations && data.type === 'automation-running') {
            const automation = this.automations[data.automation_uuid];
            if (!automation) return;

            this.emit('automation-running', data.runner_id, automation);
        }

        if (this.automations && data.type === 'automation-progress') {
            this.emit('automation-progress', data.runner_id, data.progress);
        }

        if (this.automations && data.type === 'automation-finished') {
            this.emit('automation-finished', data.runner_id);
        }

        if (this.scenes && data.type === 'add-scene') {
            if (this.scenes[data.uuid]) return;

            const [[scene_data], [scene_permissions]] = await Promise.all([
                this.connection!.getScenes(data.uuid),
                this.connection!.getScenesPermissions(data.uuid),
            ]);

            const scene = new Scene(this.connection!, data.uuid, scene_data, false, scene_permissions);

            $set(this.scenes, scene.uuid, scene);
            this.emit('new-scene', scene);
            this.emit('new-scenes', [scene]);
            this.emit('updated-scenes', [scene], []);
        }

        if (this.scenes && data.type === 'remove-scene') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            $delete(this.scenes, scene.uuid);
            this.emit('removed-scene', scene);
            this.emit('removed-scenes', [scene]);
            this.emit('updated-scenes', [], [scene]);
        }

        if (this.scenes && data.type === 'update-scene') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            scene._setData(data.data);
        }

        if (this.scenes && data.type === 'scene-activating') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            scene._handleActivating(data);
        }

        if (this.scenes && data.type === 'scene-deactivating') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            scene._handleDeactivating(data);
        }

        if (this.scenes && data.type === 'scene-activated') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            scene._handleActivated(data);
        }

        if (this.scenes && data.type === 'scene-deactivated') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            scene._handleDeactivated(data);
        }

        if (this.scenes && data.type === 'scene-progress') {
            const scene = this.scenes[data.uuid];
            if (!scene) return;

            scene._handleProgress(data);
        }

        if (this.system_information && data.type === 'update-system-information') {
            for (const [key, d] of Object.entries(data.data) as [keyof SystemInformationData, any][]) {
                // @ts-ignore
                this.system_information[key] = d;
                this.emit('update-system-information', key, d);
            }
        }
    }

    protected handleDisconnected(event: CloseEvent): void
    protected handleDisconnected(code: number, reason: string): void
    protected handleDisconnected(event: any) {
        console.log('Disconnected');
        this.connection!.removeListener('received-broadcast', this._handleBroadcastMessage);
        this.connection!.removeListener('disconnected', this._handleDisconnected);
        this.connection = null;
        this.connected = false;
        this.connect_error = event;

        this.emit('disconnected');
    }

    /**
     * Load accessories or add a dependency on loaded accessories.
     *
     * @param {*} [dep]
     * @param {Array} [accessory_uuids]
     * @return {Promise}
     */
    async loadAccessories(dep?: any, accessory_uuids?: string[]) {
        const required_accessory_uuids = this.getRequiredAccessoryUUIDs();
        const load_accessories = !this.accessories || (required_accessory_uuids && accessory_uuids &&
            accessory_uuids.find(uuid => !required_accessory_uuids.has(uuid))) ||
            (required_accessory_uuids && !accessory_uuids);

        if (dep) {
            this.accessories_dependencies.set(dep, accessory_uuids || true);
        }

        if (!this.accessories) this.accessories = {};
        if (load_accessories && this.connection) await this.refreshAccessories();
    }

    /**
     * Unload accessories or remove a dependency on loaded accessories.
     *
     * @param {*} [dep]
     */
    unloadAccessories(dep?: any) {
        if (dep) {
            this.accessories_dependencies.delete(dep);

            // If there are more dependencies don't unload accessories yet
            if (this.accessories_dependencies.size) return;
        }

        this.accessories = null;
    }

    getRequiredAccessoryUUIDs(): Set<string> | false {
        if (!this.accessories_dependencies.size) return new Set();

        const required_accessory_uuids = new Set<string>();

        for (const accessory_uuids of this.accessories_dependencies.values()) {
            if (!(accessory_uuids instanceof Array)) return false;

            for (const uuid of accessory_uuids) required_accessory_uuids.add(uuid);
        }

        return required_accessory_uuids;
    }

    async refreshAccessories(dont_emit_events = false) {
        if (!this.connection) throw new Error('Not connected');
        if (this.loading_accessories) throw new Error('Already loading accessories');
        this.loading_accessories = true;

        try {
            const required_accessory_uuids = this.getRequiredAccessoryUUIDs();
            const accessory_uuids = (await this.connection.listAccessories())
                .filter(uuid => !required_accessory_uuids || required_accessory_uuids.has(uuid));

            if (!this.accessories) this.accessories = {};
            const new_accessories = [];
            const removed_accessories = [];

            for (const accessory_uuid of accessory_uuids) {
                // Accessory already exists
                if (this.accessories[accessory_uuid]) continue;

                // Add this accessory to the list of accessories we don't yet know about
                new_accessories.push(accessory_uuid);
            }

            for (const accessory_uuid of Object.keys(this.accessories)) {
                // Accessory still exists
                if (accessory_uuids.includes(accessory_uuid)) continue;

                // Add this accessory to the list of accessories that have been removed
                removed_accessories.push(accessory_uuid);
            }

            const [
                new_accessory_details, new_accessory_data, new_accessory_permissions, new_accessory_status,
            ] = new_accessories.length ? await Promise.all([
                this.connection.getAccessories(...new_accessories),
                this.connection.getAccessoriesData(...new_accessories),
                this.connection.getAccessoriesPermissions(...new_accessories),
                this.connection.getAccessoriesStatus(...new_accessories),
            ]) : [[], [], [], []];

            const added_accessories = new_accessories.map((uuid, index) => new Accessory(this.connection!, uuid,
                new_accessory_details[index], new_accessory_data[index], new_accessory_permissions[index],
                new_accessory_status[index], this.service_components
            ));

            for (const accessory of added_accessories) {
                $set(this.accessories, accessory.uuid, accessory);
                if (!dont_emit_events) this.emit('new-accessory', accessory);
            }

            if (added_accessories.length && !dont_emit_events) this.emit('new-accessories', added_accessories);

            const removed_accessory_objects = removed_accessories.map(uuid => this.accessories![uuid]);

            for (const accessory of removed_accessory_objects) {
                $delete(this.accessories, accessory.uuid);
                if (!dont_emit_events) this.emit('removed-accessory', accessory);
            }

            if (removed_accessories.length && !dont_emit_events) {
                this.emit('removed-accessories', removed_accessory_objects);
            }

            if (added_accessories.length || removed_accessories.length) {
                this.emit('updated-accessories', added_accessories, removed_accessory_objects);
            }

            this.updateCachedData();
        } finally {
            this.loading_accessories = false;
        }
    }

    loadLayouts(dep?: any, layout_uuids?: string[]) {
        const required_layout_uuids = this.getRequiredLayoutUUIDs();
        const load_layouts = !this.layouts || (required_layout_uuids && layout_uuids &&
            layout_uuids.find(uuid => !required_layout_uuids.has(uuid))) || (required_layout_uuids && !layout_uuids);

        if (dep) {
            this.layouts_dependencies.set(dep, layout_uuids || true);
        }

        if (!this.layouts) this.layouts = {};
        if (load_layouts && this.connection) this.refreshLayouts();
    }

    unloadLayouts(dep?: any) {
        if (dep) {
            this.layouts_dependencies.delete(dep);

            // If there are more dependencies don't unload layouts yet
            if (this.layouts_dependencies.size) return;
        }

        this.layouts = null;
    }

    getRequiredLayoutUUIDs(): Set<string> | false {
        if (!this.layouts_dependencies.size) return new Set();

        const required_layout_uuids = new Set<string>();

        for (const layout_uuids of this.layouts_dependencies.values()) {
            if (!(layout_uuids instanceof Array)) return false;

            for (const uuid of layout_uuids) required_layout_uuids.add(uuid);
        }

        return required_layout_uuids;
    }

    async refreshLayouts(dont_emit_events = false) {
        if (!this.connection) throw new Error('Not connected');
        if (this.loading_layouts) throw new Error('Already loading layouts');
        this.loading_layouts = true;

        try {
            const required_layout_uuids = this.getRequiredLayoutUUIDs();
            const layout_uuids = (await this.connection.listLayouts())
                .filter(uuid => !required_layout_uuids || required_layout_uuids.has(uuid));

            if (!this.layouts) this.layouts = {};
            const new_layout_uuids: string[] = [];
            const removed_layout_uuids = [];

            for (const uuid of layout_uuids) {
                // Layout already exists
                if (this.layouts[uuid]) continue;

                // Add this layout to the list of layouts we don't yet know about
                new_layout_uuids.push(uuid);
            }

            for (const uuid of Object.keys(this.layouts)) {
                // Layout still exists
                if (layout_uuids.includes(uuid)) continue;

                // Add this layout to the list of layouts that have been removed
                removed_layout_uuids.push(uuid);
            }

            const [
                new_layouts_data, new_layouts_sections, new_layouts_permissions,
            ] = new_layout_uuids.length ? await Promise.all([
                this.connection.getLayouts(...new_layout_uuids),
                this.connection.listLayoutSections(...new_layout_uuids).then(section_uuids => {
                    const flat_section_uuids = section_uuids.map((section_uuids, index) => {
                        return section_uuids.map(section_uuid =>
                            [new_layout_uuids[index], section_uuid, index]);
                    // @ts-ignore
                    }).flat();

                    return this.connection!.getLayoutSections(...flat_section_uuids.map(([
                        layout_uuid, section_uuid, index,
                    ]: [string, string, number]) => [layout_uuid, section_uuid])).then(section_data => {
                        const all_layout_sections: {[uuid: string]: any} = {};

                        // eslint-disable-next-line guard-for-in
                        for (const index in section_data) {
                            const layout_uuid = flat_section_uuids[index][0];
                            const section_uuid = flat_section_uuids[index][1];
                            const data = section_data[index];

                            const layout_sections = all_layout_sections[layout_uuid] ||
                                (all_layout_sections[layout_uuid] = {});
                            layout_sections[section_uuid] = data;
                        }

                        return new_layout_uuids.map(uuid => all_layout_sections[uuid]);
                    });
                }),
                this.connection.getLayoutsPermissions(...new_layout_uuids),
            ]) : [[], [], []];

            const new_layouts = new_layout_uuids.map((uuid, index) => new Layout(this.connection!, uuid,
                new_layouts_data[index], new_layouts_sections[index], new_layouts_permissions[index]));

            for (const layout of new_layouts) {
                $set(this.layouts, layout.uuid, layout);
                if (!dont_emit_events) this.emit('new-layout', layout);
            }

            if (new_layouts.length && !dont_emit_events) this.emit('new-layouts', new_layouts);

            const removed_layouts = removed_layout_uuids.map(uuid => this.layouts![uuid]);

            for (const layout of removed_layouts) {
                $delete(this.layouts, layout.uuid);
                if (!dont_emit_events) this.emit('removed-layout', layout);
            }

            if (removed_layouts.length && !dont_emit_events) this.emit('removed-layouts', removed_layouts);

            if (new_layouts.length || removed_layouts.length) {
                this.emit('updated-layouts', new_layouts, removed_layouts);
            }

            this.updateCachedData();
        } finally {
            this.loading_layouts = false;
        }
    }

    loadAutomations(dep?: any, automation_uuids?: string[]) {
        const required_automation_uuids = this.getRequiredAutomationUUIDs();
        const load_automations = !this.automations || (required_automation_uuids && automation_uuids &&
            automation_uuids.find(uuid => !required_automation_uuids.has(uuid))) ||
            (required_automation_uuids && !automation_uuids);

        if (dep) {
            this.automations_dependencies.set(dep, automation_uuids || true);
        }

        if (!this.automations) this.automations = {};
        if (load_automations && this.connection) this.refreshAutomations();
    }

    unloadAutomations(dep?: any) {
        if (dep) {
            this.automations_dependencies.delete(dep);

            // If there are more dependencies don't unload automations yet
            if (this.automations_dependencies.size) return;
        }

        this.automations = null;
    }

    getRequiredAutomationUUIDs(): Set<string> | false {
        if (!this.automations_dependencies.size) return new Set();

        const required_automation_uuids = new Set<string>();

        for (const automation_uuids of this.automations_dependencies.values()) {
            if (!(automation_uuids instanceof Array)) return false;

            for (const uuid of automation_uuids) required_automation_uuids.add(uuid);
        }

        return required_automation_uuids;
    }

    async refreshAutomations(dont_emit_events = false) {
        if (!this.connection) throw new Error('Not connected');
        if (this.loading_automations) throw new Error('Already loading');
        this.loading_automations = true;

        try {
            const automation_uuids = await this.connection.listAutomations();

            if (!this.automations) this.automations = {};
            const new_automation_uuids = [];
            const removed_automation_uuids = [];

            for (const uuid of automation_uuids) {
                // Automation already exists
                if (this.automations[uuid]) continue;

                // Add this automation to the list of automations we don't yet know about
                new_automation_uuids.push(uuid);
            }

            for (const uuid of Object.keys(this.automations)) {
                // Automation still exists
                if (automation_uuids.includes(uuid)) continue;

                // Add this automation to the list of automations that have been removed
                removed_automation_uuids.push(uuid);
            }

            const [new_automations_data, new_automations_permissions] = await Promise.all([
                this.connection.getAutomations(...new_automation_uuids),
                this.connection.getAutomationsPermissions(...new_automation_uuids),
            ]);

            const new_automations = new_automation_uuids.map((uuid, index) => new Automation(this.connection!,
                uuid, new_automations_data[index], new_automations_permissions[index])); // eslint-disable-line vue/script-indent

            for (const automation of new_automations) {
                $set(this.automations, automation.uuid, automation);
                if (!dont_emit_events) this.emit('new-automation', automation);
            }

            if (new_automations.length && !dont_emit_events) this.emit('new-automations', new_automations);

            const removed_automations = removed_automation_uuids.map(uuid => this.automations![uuid]);

            for (const automation of removed_automations) {
                $delete(this.automations, automation.uuid);
                if (!dont_emit_events) this.emit('removed-automation', automation);
            }

            if (removed_automations.length && !dont_emit_events) this.emit('removed-automations', removed_automations);

            if (new_automations.length || removed_automations.length) {
                this.emit('updated-automations', new_automations, removed_automations);
            }

            this.updateCachedData();
        } finally {
            this.loading_automations = false;
        }
    }

    loadScenes(dep?: any, scene_uuids?: string[]) {
        const required_scene_uuids = this.getRequiredSceneUUIDs();
        const load_scenes = !this.scenes || (required_scene_uuids && scene_uuids &&
            scene_uuids.find(uuid => !required_scene_uuids.has(uuid))) || (required_scene_uuids && !scene_uuids);

        if (dep) {
            this.scenes_dependencies.set(dep, scene_uuids || true);
        }

        if (!this.scenes) this.scenes = {};
        if (load_scenes && this.connection) this.refreshScenes();
    }

    unloadScenes(dep?: any) {
        if (dep) {
            this.scenes_dependencies.delete(dep);

            // If there are more dependencies don't unload scenes yet
            if (this.scenes_dependencies.size) return;
        }

        this.scenes = null;
    }

    getRequiredSceneUUIDs(): Set<string> | false {
        if (!this.scenes_dependencies.size) return new Set();

        const required_scene_uuids = new Set<string>();

        for (const scene_uuids of this.scenes_dependencies.values()) {
            if (!(scene_uuids instanceof Array)) return false;

            for (const uuid of scene_uuids) required_scene_uuids.add(uuid);
        }

        return required_scene_uuids;
    }

    async refreshScenes(dont_emit_events = false) {
        if (!this.connection) throw new Error('Not connected');
        if (this.loading_scenes) throw new Error('Already loading scenes');
        this.loading_scenes = true;

        try {
            const required_scene_uuids = this.getRequiredSceneUUIDs();
            const scene_uuids = (await this.connection.listScenes())
                .filter(uuid => !required_scene_uuids || required_scene_uuids.has(uuid));

            if (!this.scenes) this.scenes = {};
            const new_scene_uuids = [];
            const removed_scene_uuids = [];

            for (const uuid of scene_uuids) {
                // Scene already exists
                if (this.scenes[uuid]) continue;

                // Add this scene to the list of scenes we don't yet know about
                new_scene_uuids.push(uuid);
            }

            for (const uuid of Object.keys(this.scenes)) {
                // Scene still exists
                if (scene_uuids.includes(uuid)) continue;

                // Add this scene to the list of scenes that have been removed
                removed_scene_uuids.push(uuid);
            }

            const [
                new_scenes_data, new_scenes_active, new_scenes_permissions,
            ] = new_scene_uuids.length ? await Promise.all([
                this.connection.getScenes(...new_scene_uuids),
                this.connection.checkScenesActive(...new_scene_uuids),
                this.connection.getScenesPermissions(...new_scene_uuids),
            ]) : [[], [], []];

            const new_scenes = new_scene_uuids.map((uuid, index) => new Scene(this.connection!, uuid,
                new_scenes_data[index], new_scenes_active[index], new_scenes_permissions[index]));

            for (const scene of new_scenes) {
                $set(this.scenes, scene.uuid, scene);
                if (!dont_emit_events) this.emit('new-scene', scene);
            }

            if (new_scenes.length && !dont_emit_events) this.emit('new-scenes', new_scenes);

            const removed_scenes = removed_scene_uuids.map(uuid => this.scenes![uuid]);

            for (const scene of removed_scenes) {
                $delete(this.scenes, scene.uuid);
                if (!dont_emit_events) this.emit('removed-scene', scene);
            }

            if (removed_scenes.length && !dont_emit_events) this.emit('removed-scenes', removed_scenes);

            if (new_scenes.length || removed_scenes.length) {
                this.emit('updated-scenes', new_scenes, removed_scenes);
            }

            this.updateCachedData();
        } finally {
            this.loading_scenes = false;
        }
    }

    /**
     * Subscribes to characteristic updates.
     * Use of this isn't recommended, you should use the subscribe method on the characteristic which handles multiple
     * subscriptions.
     *
     * @param {Characteristic[]} characteristics
     * @return {Promise}
     */
    async subscribeCharacteristics(characteristics: Characteristic[]) {
        if (!this.connection) throw new Error('Not connected');

        const uuids = characteristics.map(characteristic => [
            characteristic.service.accessory.uuid, characteristic.service.uuid, characteristic.uuid,
        ]);

        await this.connection.subscribeCharacteristics(...uuids as any);

        for (const characteristic of characteristics) {
            this.connection.subscribed_characteristics.add(characteristic);
        }

        for (const characteristic of characteristics) {
            // Force Vue to update the subscribed property, as Vue doesn't support Sets
            characteristic._subscribed = !characteristic._subscribed;
        }
    }

    subscribeCharacteristic(characteristic: Characteristic) {
        return this.subscribeCharacteristics([characteristic]);
    }

    static queueSubscribeCharacteristic(characteristic: Characteristic): Promise<any> {
        return new Promise((resolve, reject) => {
            const connection = characteristic.service.accessory.connection;
            const queue = connection.subscribe_queue || (connection.subscribe_queue = []);

            let index;
            if ((index = queue.findIndex(q => q[0] === characteristic)) > -1) {
                // @ts-ignore
                if (queue[index][1] instanceof Array) queue[index][1].push(resolve);
                // @ts-ignore
                else queue[index][1] = [queue[index][1], resolve];

                // @ts-ignore
                if (queue[index][2] instanceof Array) queue[index][2].push(reject);
                // @ts-ignore
                else queue[index][2] = [queue[index][2], reject];
            } else queue.push([characteristic, resolve, reject]);

            if (typeof connection.subscribe_queue_timeout === 'undefined' ||
                connection.subscribe_queue_timeout === null
            ) {
                connection.subscribe_queue_timeout = setTimeout(() =>
                    this.processCharacteristicSubscribeQueue(connection), 100);
            }

            if (connection.unsubscribe_queue) {
                let index;
                while ((index = connection.unsubscribe_queue.findIndex(q => q[0] === characteristic)) > -1) {
                    if (connection.unsubscribe_queue[index][2] instanceof Array) connection.unsubscribe_queue[index][2] // eslint-disable-line curly
                        // @ts-ignore
                        .map(rj => rj.call(null, new Error('Canceled by call to subscribe')));
                    else connection.unsubscribe_queue[index][2].call(null, new Error('Canceled by call to subscribe'));
                    connection.unsubscribe_queue.splice(index, 1);
                }

                if (!connection.unsubscribe_queue.length) {
                    clearTimeout(connection.unsubscribe_queue_timeout as any);

                    connection.unsubscribe_queue = null;
                    connection.unsubscribe_queue_timeout = null;
                }
            }
        });
    }

    static async processCharacteristicSubscribeQueue(connection: Connection) {
        const queue = connection.subscribe_queue || [];
        clearTimeout(connection.subscribe_queue_timeout as any);

        connection.subscribe_queue = null;
        connection.subscribe_queue_timeout = null;

        try {
            const uuids = queue.map(q => [
                q[0].service.accessory.uuid, q[0].service.uuid, q[0].uuid,
            ]);

            await connection.subscribeCharacteristics(...uuids as any);

            // eslint-disable-next-line guard-for-in
            for (const index in queue) {
                connection.subscribed_characteristics.add(queue[index][0]);

                // Force Vue to update the subscribed property, as Vue doesn't support Sets
                queue[index][0]._subscribed = !queue[index][0]._subscribed;

                // @ts-ignore
                if (queue[index][1] instanceof Array) queue[index][1].map(rs => rs.call(null, queue[index]));
                else queue[index][1].call(null, queue[index]);
            }
        } catch (err) {
            for (const q of queue) {
                if (q[2] instanceof Array) q[2].map(rj => rj.call(null, err));
                else q[2].call(null, err);
            }
        }
    }

    /**
     * Unsubscribes from characteristic updates.
     * Use of this isn't recommended, you should use the unsubscribe method on the characteristic which handles
     * multiple subscriptions.
     *
     * @param {Characteristic[]} characteristics
     * @return {Promise}
     */
    async unsubscribeCharacteristics(characteristics: Characteristic[]) {
        if (!this.connection) throw new Error('Not connected');

        const uuids = characteristics.map(characteristic => [
            characteristic.service.accessory.uuid, characteristic.service.uuid, characteristic.uuid,
        ]);

        await this.connection.unsubscribeCharacteristics(...uuids as any);

        for (const characteristic of characteristics) {
            this.connection.subscribed_characteristics.delete(characteristic);
        }

        for (const characteristic of characteristics) {
            // Force Vue to update the subscribed property, as Vue doesn't support Sets
            characteristic._subscribed = !characteristic._subscribed;
        }
    }

    unsubscribeCharacteristic(characteristic: Characteristic) {
        return this.unsubscribeCharacteristics([characteristic]);
    }

    static queueUnsubscribeCharacteristic(characteristic: Characteristic): Promise<any> {
        return new Promise((resolve, reject) => {
            const connection = characteristic.service.accessory.connection;
            const queue = connection.unsubscribe_queue || (connection.unsubscribe_queue = []);

            let index;
            if ((index = queue.findIndex(q => q[0] === characteristic)) > -1) {
                // @ts-ignore
                if (queue[index][1] instanceof Array) queue[index][1].push(resolve);
                // @ts-ignore
                else queue[index][1] = [queue[index][1], resolve];

                // @ts-ignore
                if (queue[index][2] instanceof Array) queue[index][2].push(reject);
                // @ts-ignore
                else queue[index][2] = [queue[index][2], reject];
            } else queue.push([characteristic, resolve, reject]);

            if (typeof connection.unsubscribe_queue_timeout === 'undefined' ||
                connection.unsubscribe_queue_timeout === null
            ) {
                connection.unsubscribe_queue_timeout = setTimeout(() =>
                    this.processCharacteristicUnsubscribeQueue(connection), 100);
            }

            if (connection.subscribe_queue) {
                let index;
                while ((index = connection.subscribe_queue.findIndex(q => q[0] === characteristic)) > -1) {
                    if (connection.subscribe_queue[index][2] instanceof Array) connection.subscribe_queue[index][2] // eslint-disable-line curly
                        // @ts-ignore
                        .map(rj => rj.call(null, new Error('Canceled by call to unsubscribe')));
                    else connection.subscribe_queue[index][2].call(null, new Error('Canceled by call to unsubscribe'));
                    connection.subscribe_queue.splice(index, 1);
                }

                if (!connection.subscribe_queue.length) {
                    clearTimeout(connection.subscribe_queue_timeout as any);

                    connection.subscribe_queue = null;
                    connection.subscribe_queue_timeout = null;
                }
            }
        });
    }

    static async processCharacteristicUnsubscribeQueue(connection: Connection) {
        const queue = connection.unsubscribe_queue || [];
        clearTimeout(connection.unsubscribe_queue_timeout as any);

        connection.unsubscribe_queue = null;
        connection.unsubscribe_queue_timeout = null;

        try {
            const uuids = queue.map(q => [q[0].service.accessory.uuid, q[0].service.uuid, q[0].uuid]);

            await connection.unsubscribeCharacteristics(...uuids as any);

            // eslint-disable-next-line guard-for-in
            for (const index in queue) {
                connection.subscribed_characteristics.delete(queue[index][0]);

                // Force Vue to update the subscribed property, as Vue doesn't support Sets
                queue[index][0]._subscribed = !queue[index][0]._subscribed;

                // @ts-ignore
                if (queue[index][1] instanceof Array) queue[index][1].map(rs => rs.call(null, queue[index]));
                else queue[index][1].call(null, queue[index]);
            }
        } catch (err) {
            for (const q of queue) {
                if (q[2] instanceof Array) q[2].map(rj => rj.call(null, err));
                else q[2].call(null, err);
            }
        }
    }

    loadSystemInformation(dep?: any) {
        if (dep) {
            this.system_information_dependencies.add(dep);
        }

        if (this.connection) {
            return Promise.all([
                this.connection.subscribeSystemInformation(),
                this.refreshSystemInformation(),
            ]);
        }
    }

    unloadSystemInformation(dep?: any) {
        if (dep) {
            this.system_information_dependencies.delete(dep);

            // If there are more dependencies don't unload system information yet
            if (this.system_information_dependencies.size) return;
        }

        this.system_information = null;

        if (this.connection) {
            return this.connection.unsubscribeSystemInformation();
        }
    }

    async refreshSystemInformation() {
        if (!this.connection) throw new Error('Not connected');
        if (this.loading_system_information) throw new Error('Already loading system information');
        this.loading_system_information = true;

        try {
            this.system_information = await this.connection.getSystemInformation();
        } finally {
            this.loading_system_information = false;
        }
    }

    async openConsole() {
        if (!this.connection) throw new Error('Not connected');

        const id = await this.connection.openConsole();

        return new Console(this.connection, id);
    }
}

interface ClientEvents {
    'connected': (this: Client, connection: Connection) => void;
    'disconnected': (this: Client) => void;
    'received-broadcast': (this: Client, data: BroadcastMessage) => void;
    'update-home-permissions': (this: Client, data: GetHomePermissionsResponseMessage) => void;
    'update-home-settings': (this: Client, data: Home) => void;

    'cached-data': (this: Client, data: string) => void;

    'new-accessory': (this: Client, accessory: Accessory) => void;
    'new-accessories': (this: Client, accessories: Accessory[]) => void;
    'removed-accessory': (this: Client, accessory: Accessory) => void;
    'removed-accessories': (this: Client, accessories: Accessory[]) => void;
    'updated-accessories': (this: Client, added: Accessory[], removed: Accessory[]) => void;

    'new-layout': (this: Client, layout: Layout) => void;
    'new-layouts': (this: Client, layouts: Layout[]) => void;
    'removed-layout': (this: Client, layout: Layout) => void;
    'removed-layouts': (this: Client, layouts: Layout[]) => void;
    'updated-layouts': (this: Client, added: Layout[], removed: Layout[]) => void;

    'new-automation': (this: Client, automation: Automation) => void;
    'new-automations': (this: Client, automations: Automation[]) => void;
    'removed-automation': (this: Client, automation: Automation) => void;
    'removed-automations': (this: Client, automations: Automation[]) => void;
    'updated-automations': (this: Client, added: Automation[], removed: Automation[]) => void;

    'automation-running': (this: Client, runner_id: number, automation: Automation) => void;
    'automation-progress': (this: Client, runner_id: number, progress: number) => void;
    'automation-finished': (this: Client, runner_id: number) => void;

    'new-scene': (this: Client, scene: Scene) => void;
    'new-scenes': (this: Client, scenes: Scene[]) => void;
    'removed-scene': (this: Client, scene: Scene) => void;
    'removed-scenes': (this: Client, scenes: Scene[]) => void;
    'updated-scenes': (this: Client, added: Scene[], removed: Scene[]) => void;

    'update-system-information': <K extends keyof SystemInformationData = keyof SystemInformationData>(this: Client,
        key: K, data: SystemInformationData[K]) => void;
}
