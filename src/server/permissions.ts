
import Homebridge from './homebridge';

import Connection from './connection';
import Logger from '../common/logger';

const DEVELOPMENT = true;

import {BroadcastMessage} from '../common/types/broadcast-messages';
import {Permissions as UserPermissions} from '../common/types/storage';

export default class Permissions {
    readonly connection: Connection;
    readonly log: Logger;

    constructor(connection: Connection) {
        this.connection = connection;
        this.log = connection.log.withPrefix('Permissions');
    }

    get user() {
        return this.connection.authenticated_user;
    }

    get permissions(): UserPermissions {
        if (!this.user || !this.user.id) return {};

        return Object.defineProperty(this, 'permissions', {
            configurable: true,
            value: this.connection.server.storage.getItem('Permissions.' + this.user.id).then(p => p || {
                '*': ['root', 'cli-token'].includes(this.user!.id),
                get_home_settings: true,
                create_accessories: true,
                create_layouts: true,
                create_bridges: true,
                accessories: {'*': {get: true, set: true}},
                layouts: {'*': {get: true}},
                automations: {'*': {get: false}},
                scenes: {'*': {get: true, activate: true}},
            }),
        }).permissions;
    }

    /**
     * Get the UUID of all accessories the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedAccessoryUUIDs(): Promise<string[]> {
        if (!DEVELOPMENT || !(this as any).__development_allow_local()) {
            if (!this.user) return [];
        }

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return this.getAllAccessoryUUIDs();

        const _default = permissions.accessories && permissions.accessories['*'] && permissions.accessories['*'].get;

        const uuids: any[] | string[] | PromiseLike<string[]> = [];

        for (const [uuid, accessory_permissions] of Object.entries(permissions.accessories || {})) {
            if (uuid === '*') continue;
            if (accessory_permissions.get) uuids.push(uuid);
        }

        if (!_default) return uuids;

        uuids.push(...await this.getAllAccessoryUUIDs());

        return uuids.filter((uuid, index) => {
            if (uuids.indexOf(uuid) !== index) return false;

            const accessory_permissions = (permissions.accessories || {})[index];
            if (accessory_permissions) return accessory_permissions.get;

            return true;
        });
    }

    private getAllAccessoryUUIDs(): string[] {
        const uuids = [];

        for (const bridge of this.connection.server.accessories.bridges) {
            uuids.push(bridge.uuid);
        }

        for (const accessory of this.connection.server.accessories.accessories) {
            uuids.push(accessory.uuid);
        }

        for (const accessory of this.connection.server.accessories.cached_accessories) {
            uuids.push(accessory.uuid);
        }

        for (const bridge of this.connection.server.accessories.bridges) {
            if (!(bridge instanceof Homebridge)) continue;

            for (const accessory of bridge.bridge.bridgedAccessories) {
                uuids.push(accessory.UUID);
            }
        }

        return uuids;
    }

    /**
     * Check if the user can see an accessory.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    async checkCanGetAccessory(accessory_uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] && permissions.accessories['*'].get;

        return permissions.accessories && permissions.accessories[accessory_uuid] ?
            permissions.accessories[accessory_uuid].get || false : _default || false;
    }

    async assertCanGetAccessory(accessory_uuid: string): Promise<void> {
        if (!await this.checkCanGetAccessory(accessory_uuid)) {
            throw new Error('You don\'t have permission to access this accessory');
        }
    }

    /**
     * Check if the user can control an accessory.
     *
     * @param {string} accessory_uuid
     * @param {string} service_uuid
     * @param {string} characteristic_uuid
     * @param {*} value
     * @return {Promise<boolean>}
     */
    async checkCanSetCharacteristic(
        accessory_uuid: string, service_uuid: string, characteristic_uuid: string, value?: undefined
    ): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].set;

        return permissions.accessories && permissions.accessories[accessory_uuid] ?
            permissions.accessories[accessory_uuid].get && permissions.accessories[accessory_uuid].set || false :
            _default || false;
    }

    async assertCanSetCharacteristic(
        accessory_uuid: string, service_uuid: string, characteristic_uuid: string, value?: any
    ): Promise<void> {
        if (!await this.checkCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value)) {
            throw new Error('You don\'t have permission to control this accessory');
        }
    }

    /**
     * Check if the user can access an accessory's history data.
     *
     * @param {string} accessory_uuid
     * @param {string} service_id
     * @param {string} characteristic_uuid
     * @return {Promise<boolean>}
     */
    async checkCanGetCharacteristicHistory(accessory_uuid: string, service_id: string, characteristic_uuid: string) {
        return !!this.connection.server.history && this.checkCanGetAccessory(accessory_uuid);
    }

    async assertCanGetCharacteristicHistory(accessory_uuid: string, service_id: string, characteristic_uuid: string) {
        if (!await this.checkCanGetCharacteristicHistory(accessory_uuid, service_id, characteristic_uuid)) {
            throw new Error('You don\'t have permission to access this accessory\'s history data');
        }
    }

    /**
     * Check if the user can manage an accessory.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    async checkCanSetAccessoryData(accessory_uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].manage;

        return permissions.accessories && permissions.accessories[accessory_uuid] ?
            permissions.accessories[accessory_uuid].get && permissions.accessories[accessory_uuid].manage || false :
            _default || false;
    }

    async assertCanSetAccessoryData(accessory_uuid: string): Promise<void> {
        if (!await this.checkCanSetAccessoryData(accessory_uuid)) {
            throw new Error('You don\'t have permission to manage this accessory');
        }
    }

    /**
     * Check if the user can add accessories.
     *
     * @return {Promise<boolean>}
     */
    async checkCanCreateAccessories(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.create_accessories || false;
    }

    async assertCanCreateAccessories(): Promise<void> {
        if (!await this.checkCanCreateAccessories()) {
            throw new Error('You don\'t have permission to add accessories');
        }
    }

    /**
     * Check if the user can access an accessory's settings.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    async checkCanGetAccessoryConfig(accessory_uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].config;

        return permissions.accessories && permissions.accessories[accessory_uuid] ?
            permissions.accessories[accessory_uuid].get && permissions.accessories[accessory_uuid].config || false :
            _default || false;
    }

    async assertCanGetAccessoryConfig(accessory_uuid: string): Promise<void> {
        if (!await this.checkCanGetAccessoryConfig(accessory_uuid)) {
            throw new Error('You don\'t have permission to manage this accessory');
        }
    }

    /**
     * Check if the user can manage an accessory's settings.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    async checkCanSetAccessoryConfig(accessory_uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].config;

        return permissions.accessories && permissions.accessories[accessory_uuid] ?
            permissions.accessories[accessory_uuid].get && permissions.accessories[accessory_uuid].config || false :
            _default || false;
    }

    async assertCanSetAccessoryConfig(accessory_uuid: string): Promise<void> {
        if (!await this.checkCanSetAccessoryConfig(accessory_uuid)) {
            throw new Error('You don\'t have permission to manage this accessory');
        }
    }

    /**
     * Check if the user can delete an accessory.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    async checkCanDeleteAccessory(accessory_uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].delete;

        return permissions.accessories && permissions.accessories[accessory_uuid] ?
            permissions.accessories[accessory_uuid].get && permissions.accessories[accessory_uuid].delete || false :
            _default || false;
    }

    async assertCanDeleteAccessory(accessory_uuid: string): Promise<void> {
        if (!await this.checkCanDeleteAccessory(accessory_uuid)) {
            throw new Error('You don\'t have permission to delete this accessory');
        }
    }

    /**
     * Check if the user can access this home's settings.
     *
     * @return {Promise<boolean>}
     */
    async checkCanGetHomeSettings(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.get_home_settings || permissions.set_home_settings || false;
    }

    async assertCanGetHomeSettings(): Promise<void> {
        if (!await this.checkCanGetHomeSettings()) {
            throw new Error('You don\'t have permission to access this home');
        }
    }

    /**
     * Check if the user manage this home's settings.
     *
     * @return {Promise<boolean>}
     */
    async checkCanSetHomeSettings(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.set_home_settings || false;
    }

    async assertCanSetHomeSettings(): Promise<void> {
        if (!await this.checkCanSetHomeSettings()) {
            throw new Error('You don\'t have permission to manage this home');
        }
    }

    /**
     * Get the UUID of all layouts the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedLayoutUUIDs(): Promise<string[]> {
        if (!DEVELOPMENT || !(this as any).__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids: string[] = [].concat(await this.connection.server.storage.getItem('Layouts'))
            .filter((u: string) => !u.startsWith('Overview.'));

        if (this.user) uuids.push('Overview.' + this.user.id);

        const authorised_uuids = await Promise.all(uuids.map(u => this.checkCanGetLayout(u)));
        return uuids.filter((u, index) => authorised_uuids[index]);
    }

    /**
     * Check if the user can create layouts.
     *
     * @return {Promise<boolean>}
     */
    async checkCanCreateLayouts(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.create_layouts || false;
    }

    async assertCanCreateLayouts(): Promise<void> {
        if (!await this.checkCanCreateLayouts()) {
            throw new Error('You don\'t have permission to create layouts');
        }
    }

    /**
     * Check if the user can see a layout.
     *
     * @param {string} id
     * @return {Promise<boolean>}
     */
    async checkCanGetLayout(id: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        if (id === 'Overview.' + this.user.id) return true;
        if (id.startsWith('Overview.')) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.layouts && permissions.layouts['*'] && permissions.layouts['*'].get;

        return permissions.layouts && permissions.layouts[id] ?
            permissions.layouts[id].get || false : _default || false;
    }

    async assertCanGetLayout(id: string): Promise<void> {
        if (!await this.checkCanGetLayout(id)) {
            throw new Error('You don\'t have permission to access this layout');
        }
    }

    /**
     * Check if the user can update a layout.
     *
     * @param {string} id
     * @return {Promise<boolean>}
     */
    async checkCanSetLayout(id: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        if (id === 'Overview.' + this.user.id) return true;
        if (id.startsWith('Overview.')) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.layouts && permissions.layouts['*'] &&
            permissions.layouts['*'].get && permissions.layouts['*'].set;

        return permissions.layouts && permissions.layouts[id] ?
            permissions.layouts[id].get && permissions.layouts[id].set || false : _default || false;
    }

    async assertCanSetLayout(id: string): Promise<void> {
        if (!await this.checkCanSetLayout(id)) {
            throw new Error('You don\'t have permission to update this layout');
        }
    }

    /**
     * Check if the user can delete a layout.
     *
     * @param {string} id
     * @return {Promise<boolean>}
     */
    async checkCanDeleteLayout(id: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        if (id === 'Overview.' + this.user.id) return true;
        if (id.startsWith('Overview.')) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.layouts && permissions.layouts['*'] &&
            permissions.layouts['*'].get && permissions.layouts['*'].delete;

        return permissions.layouts && permissions.layouts[id] ?
            permissions.layouts[id].get && permissions.layouts[id].delete || false : _default || false;
    }

    async assertCanDeleteLayout(id: string): Promise<void> {
        if (!await this.checkCanDeleteLayout(id)) {
            throw new Error('You don\'t have permission to delete this layout');
        }
    }

    /**
     * Get the UUID of all automations the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedAutomationUUIDs(): Promise<string[]> {
        if (!DEVELOPMENT || !(this as any).__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids: string[] = await this.connection.server.storage.getItem('Automations') || [];

        const authorised_uuids = await Promise.all(uuids.map(u => this.checkCanGetAutomation(u)));
        return uuids.filter((u: any, index: number) => authorised_uuids[index]);
    }

    /**
     * Check if the user can create automations.
     *
     * @return {Promise<boolean>}
     */
    async checkCanCreateAutomations(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.create_automations || false;
    }

    async assertCanCreateAutomations(): Promise<void> {
        if (!await this.checkCanCreateAutomations()) {
            throw new Error('You don\'t have permission to create automations');
        }
    }

    /**
     * Check if the user can see an automation.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanGetAutomation(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.automations && permissions.automations['*'] && permissions.automations['*'].get;

        return permissions.automations && permissions.automations[uuid] ?
            permissions.automations[uuid].get || false : _default || false;
    }

    async assertCanGetAutomation(uuid: string): Promise<void> {
        if (!await this.checkCanGetAutomation(uuid)) {
            throw new Error('You don\'t have permission to access this automation');
        }
    }

    /**
     * Check if the user can update an automation.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanSetAutomation(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.automations && permissions.automations['*'] &&
            permissions.automations['*'].get && permissions.automations['*'].set;

        return permissions.automations && permissions.automations[uuid] ?
            permissions.automations[uuid].get && permissions.automations[uuid].set || false : _default || false;
    }

    async assertCanSetAutomation(uuid: string): Promise<void> {
        if (!await this.checkCanSetAutomation(uuid)) {
            throw new Error('You don\'t have permission to update this automation');
        }
    }

    /**
     * Check if the user can delete an automation.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanDeleteAutomation(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.automations && permissions.automations['*'] &&
            permissions.automations['*'].get && permissions.automations['*'].delete;

        return permissions.automations && permissions.automations[uuid] ?
            permissions.automations[uuid].get && permissions.automations[uuid].delete || false : _default || false;
    }

    async assertCanDeleteAutomation(uuid: string): Promise<void> {
        if (!await this.checkCanDeleteAutomation(uuid)) {
            throw new Error('You don\'t have permission to delete this automation');
        }
    }

    /**
     * Get the UUID of all scenes the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedSceneUUIDs(): Promise<string[]> {
        if (!DEVELOPMENT || !(this as any).__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids: string[] = await this.connection.server.storage.getItem('Scenes') || [];

        const authorised_uuids = await Promise.all(uuids.map(u => this.checkCanGetScene(u)));
        return uuids.filter((u: any, index: number) => authorised_uuids[index]);
    }

    /**
     * Check if the user can create scenes.
     *
     * @return {Promise<boolean>}
     */
    async checkCanCreateScenes(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.create_scenes || false;
    }

    async assertCanCreateScenes(): Promise<void> {
        if (!await this.checkCanCreateScenes()) {
            throw new Error('You don\'t have permission to create scenes');
        }
    }

    /**
     * Check if the user can see an scene.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanGetScene(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.scenes && permissions.scenes['*'] && permissions.scenes['*'].get;

        return permissions.scenes && permissions.scenes[uuid] ?
            permissions.scenes[uuid].get || false : _default || false;
    }

    async assertCanGetScene(uuid: string): Promise<void> {
        if (!await this.checkCanGetScene(uuid)) {
            throw new Error('You don\'t have permission to access this scene');
        }
    }

    /**
     * Check if the user can see an scene.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanActivateScene(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.scenes && permissions.scenes['*'] &&
            permissions.scenes['*'].get && permissions.scenes['*'].activate;

        return permissions.scenes && permissions.scenes[uuid] ?
            permissions.scenes[uuid].get && permissions.scenes[uuid].activate || false : _default || false;
    }

    async assertCanActivateScene(uuid: string): Promise<void> {
        if (!await this.checkCanActivateScene(uuid)) {
            throw new Error('You don\'t have permission to activate/deactivate this scene');
        }
    }

    /**
     * Check if the user can update an scene.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanSetScene(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.scenes && permissions.scenes['*'] &&
            permissions.scenes['*'].get && permissions.scenes['*'].set;

        return permissions.scenes && permissions.scenes[uuid] ?
            permissions.scenes[uuid].get && permissions.scenes[uuid].set || false : _default || false;
    }

    async assertCanSetScene(uuid: string): Promise<void> {
        if (!await this.checkCanSetScene(uuid)) {
            throw new Error('You don\'t have permission to update this scene');
        }
    }

    /**
     * Check if the user can delete an scene.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanDeleteScene(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.scenes && permissions.scenes['*'] &&
            permissions.scenes['*'].get && permissions.scenes['*'].delete;

        return permissions.scenes && permissions.scenes[uuid] ?
            permissions.scenes[uuid].get && permissions.scenes[uuid].delete || false : _default || false;
    }

    async assertCanDeleteScene(uuid: string): Promise<void> {
        if (!await this.checkCanDeleteScene(uuid)) {
            throw new Error('You don\'t have permission to delete this scene');
        }
    }

    /**
     * Check if the user can create HAP bridges.
     *
     * @return {Promise<boolean>}
     */
    async checkCanCreateBridges(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.create_bridges || false;
    }

    async assertCanCreateBridges(): Promise<void> {
        if (!await this.checkCanCreateBridges()) {
            throw new Error('You don\'t have permission to create bridges');
        }
    }

    /**
     * Check if the user can see a HAP bridge.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanGetBridgeConfiguration(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].config;

        return permissions.accessories && permissions.accessories[uuid] ?
            permissions.accessories[uuid].get && permissions.accessories[uuid].config || false : _default || false;
    }

    async assertCanGetBridgeConfiguration(uuid: string): Promise<void> {
        if (!await this.checkCanGetBridgeConfiguration(uuid)) {
            throw new Error('You don\'t have permission to access this bridge\'s configuration');
        }
    }

    /**
     * Check if the user can update a HAP bridge.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanSetBridgeConfiguration(uuid: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].config;

        return permissions.accessories && permissions.accessories[uuid] ?
            permissions.accessories[uuid].get && permissions.accessories[uuid].config || false : _default || false;
    }

    async assertCanSetBridgeConfiguration(uuid: string): Promise<void> {
        if (!await this.checkCanSetBridgeConfiguration(uuid)) {
            throw new Error('You don\'t have permission to update this bridge\'s configuration');
        }
    }

    /**
     * Check if the user can delete a HAP bridge.
     *
     * @param {string} uuid
     * @return {Promise<boolean>}
     */
    async checkCanDeleteBridge(uuid: string) {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        const _default = permissions.accessories && permissions.accessories['*'] &&
            permissions.accessories['*'].get && permissions.accessories['*'].delete;

        return permissions.accessories && permissions.accessories[uuid] ?
            permissions.accessories[uuid].get && permissions.accessories[uuid].delete : _default;
    }

    async assertCanDeleteBridge(uuid: string) {
        if (!await this.checkCanDeleteBridge(uuid)) {
            throw new Error('You don\'t have permission to delete this bridge');
        }
    }

    /**
     * Check if the user can see a pairing.
     *
     * @param {string} username
     * @return {Promise<boolean>}
     */
    async checkCanGetPairing(username: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.manage_pairings || false;
    }

    async assertCanGetPairing(username: string): Promise<void> {
        if (!await this.checkCanGetPairing(username)) {
            throw new Error('You don\'t have permission to access this pairing');
        }
    }

    /**
     * Check if the user can update a pairing.
     *
     * @param {string} username
     * @return {Promise<boolean>}
     */
    async checkCanSetPairing(username: string): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.manage_pairings || false;
    }

    async assertCanSetPairing(username: string): Promise<void> {
        if (!await this.checkCanSetPairing(username)) {
            throw new Error('You don\'t have permission to update this pairing');
        }
    }

    /**
     * Check if the user can manage the server.
     *
     * @return {Promise<boolean>}
     */
    async checkCanAccessServerRuntimeInfo(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.server_runtime_info || false;
    }

    async assertCanAccessServerRuntimeInfo(): Promise<void> {
        if (!await this.checkCanAccessServerRuntimeInfo()) {
            throw new Error('You don\'t have permission to manage this home');
        }
    }

    /**
     * Check if the user can manage users.
     *
     * @return {Promise<boolean>}
     */
    async checkCanManageUsers(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.manage_users || false;
    }

    async assertCanManageUsers(): Promise<void> {
        if (!await this.checkCanManageUsers()) {
            throw new Error('You don\'t have permission to manage users');
        }
    }

    /**
     * Check if the user can manage permissions.
     *
     * @return {Promise<boolean>}
     */
    async checkCanManagePermissions(): Promise<boolean> {
        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.manage_permissions || false;
    }

    async assertCanManagePermissions(): Promise<void> {
        if (!await this.checkCanManagePermissions()) {
            throw new Error('You don\'t have permission to manage user permissions');
        }
    }

    /**
     * Check if the user can manage plugins.
     *
     * @return {Promise<boolean>}
     */
    async checkCanManagePlugins(): Promise<boolean> {
        return false;

        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        // return permissions.manage_plugins || false;
    }

    async assertCanManagePlugins(): Promise<void> {
        if (!await this.checkCanManagePlugins()) {
            throw new Error('You don\'t have permission to manage plugins');
        }
    }

    /**
     * Check if the user can use web consoles.
     *
     * @return {Promise<boolean>}
     */
    async checkCanOpenWebConsole(): Promise<boolean> {
        return false;

        if (!this.user) return false;

        const permissions = await this.permissions || {} as UserPermissions;
        if (permissions['*']) return true;

        return permissions.web_console || false;
    }

    async assertCanOpenWebConsole(): Promise<void> {
        if (!await this.checkCanOpenWebConsole()) {
            throw new Error('You don\'t have permission to open a console');
        }
    }

    /**
     * Check if the user should receive a broadcast message.
     *
     * @param {Object} data
     * @param {string} data.type
     * @return {Promise<boolean>}
     */
    async checkShouldReceiveBroadcast(data: BroadcastMessage): Promise<boolean> {
        if (data.type === 'add-accessories' || data.type === 'remove-accessories') {
            return Promise.all(data.ids.map(uuid => this.checkCanGetAccessory(uuid))).then(g => !g.find(g => !g));
        }
        if (data.type === 'update-characteristic') return this.checkCanGetAccessory(data.accessory_uuid);
        if (data.type === 'update-accessory-status' || data.type === 'update-accessory-data') {
            return this.checkCanGetAccessory(data.uuid);
        }
        if (data.type === 'update-home-settings') return this.checkCanGetHomeSettings();
        if (data.type === 'add-layout' || data.type === 'update-layout' || data.type === 'remove-layout') {
            return this.checkCanGetLayout(data.uuid);
        }
        if (data.type === 'add-layout-section' || data.type === 'update-layout-section' ||
            data.type === 'remove-layout-section'
        ) {
            return this.checkCanGetLayout(data.layout_uuid);
        }
        if (data.type === 'update-pairings') {
            return Promise.all([this.checkCanGetAccessory(data.bridge_uuid), this.checkCanAccessServerRuntimeInfo()])
                .then(r => r.reduce((c, a) => c && a));
        }
        if (data.type === 'update-pairing-data') {
            return Promise.all([this.checkCanGetPairing(data.id), this.checkCanAccessServerRuntimeInfo()])
                .then(r => r.reduce((c, a) => c && a));
        }
        if (data.type === 'automation-running' || data.type === 'automation-progress' ||
            data.type === 'automation-finished'
        ) {
            // Only automation-running events have an automation_uuid property
            const runner = this.connection.server.automations.runners[data.runner_id];
            return !!(runner && runner.automation.uuid && this.checkCanGetAutomation(runner.automation.uuid));
        }

        // Always sent to a single client
        if (data.type === 'console-output') return false;

        if (DEVELOPMENT && (this as any).__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }
}

if (DEVELOPMENT) {
    const local_addresses = ['::1', '::ffff:127.0.0.1', '127.0.0.1'];

    (Permissions as any).prototype.__development_allow_local = function() {
        return false;

        if (local_addresses.includes(this.connection.req.connection.remoteAddress) &&
            !this.connection.req.headers['x-forwarded-for']
        ) {
            return true;
        }
    };
}
