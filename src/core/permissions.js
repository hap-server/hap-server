
import Homebridge from './homebridge';

const DEVELOPMENT = true;

export default class Permissions {
    constructor(connection) {
        this.connection = connection;
        this.log = connection.log.withPrefix('Permissions');
    }

    get user() {
        return this.connection.authenticated_user;
    }

    /**
     * Get the UUID of all accessories the user can see.
     *
     * @return {Promise<Array>}
     */
    getAuthorisedAccessoryUUIDs() {
        if (!DEVELOPMENT || !this.__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids = [];

        for (const bridge of this.connection.server.bridges) {
            uuids.push(bridge.uuid);
        }

        for (const accessory of this.connection.server.accessories) {
            uuids.push(accessory.uuid);
        }

        for (const accessory of this.connection.server.cached_accessories) {
            uuids.push(accessory.uuid);
        }

        for (const bridge of this.connection.server.bridges) {
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
    checkCanGetAccessory(accessory_uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetAccessory(accessory_uuid) {
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
    checkCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        if (!await this.checkCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value)) {
            throw new Error('You don\'t have permission to control this accessory');
        }
    }

    /**
     * Check if the user can manage an accessory.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    checkCanSetAccessoryData(accessory_uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetAccessoryData(accessory_uuid) {
        if (!await this.checkCanSetAccessoryData(accessory_uuid)) {
            throw new Error('You don\'t have permission to manage this accessory');
        }
    }

    /**
     * Check if the user can add accessories.
     *
     * @return {Promise<boolean>}
     */
    checkCanCreateAccessories() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanCreateAccessories(accessory_uuid) {
        if (!await this.checkCanCreateAccessories(accessory_uuid)) {
            throw new Error('You don\'t have permission to add accessories');
        }
    }

    /**
     * Check if the user can access an accessory's settings.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    checkCanGetAccessoryConfig(accessory_uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetAccessoryConfig(accessory_uuid) {
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
    checkCanSetAccessoryConfig(accessory_uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetAccessoryConfig(accessory_uuid) {
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
    checkCanDeleteAccessory(accessory_uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanDeleteAccessory(accessory_uuid) {
        if (!await this.checkCanDeleteAccessory(accessory_uuid)) {
            throw new Error('You don\'t have permission to delete this accessory');
        }
    }

    /**
     * Check if the user can access this home's settings.
     *
     * @return {Promise<boolean>}
     */
    checkCanGetHomeSettings() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetHomeSettings() {
        if (!await this.checkCanGetHomeSettings()) {
            throw new Error('You don\'t have permission to access this home');
        }
    }

    /**
     * Check if the user manage this home's settings.
     *
     * @return {Promise<boolean>}
     */
    checkCanSetHomeSettings() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetHomeSettings() {
        if (!await this.checkCanSetHomeSettings()) {
            throw new Error('You don\'t have permission to manage this home');
        }
    }

    /**
     * Get the UUID of all layouts the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedLayoutUUIDs() {
        if (!DEVELOPMENT || !this.__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids = [].concat(await this.connection.server.storage.getItem('Layouts'))
            .filter(u => !u.startsWith('Overview.'));

        if (this.user) uuids.push('Overview.' + this.user.id);

        return uuids;
    }

    /**
     * Check if the user can create layouts.
     *
     * @return {Promise<boolean>}
     */
    checkCanCreateLayouts() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanCreateLayouts() {
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
    checkCanGetLayout(id) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        if (id === 'Overview.' + this.user.id) return true;
        if (id.startsWith('Overview.')) return false;

        return true;
    }

    async assertCanGetLayout(id) {
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
    checkCanSetLayout(id) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        if (id === 'Overview.' + this.user.id) return true;
        if (id.startsWith('Overview.')) return false;

        return true;
    }

    async assertCanSetLayout(id) {
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
    checkCanDeleteLayout(id) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        if (id === 'Overview.' + this.user.id) return true;
        if (id.startsWith('Overview.')) return false;

        return true;
    }

    async assertCanDeleteLayout(id) {
        if (!await this.checkCanDeleteLayout(id)) {
            throw new Error('You don\'t have permission to delete this layout');
        }
    }

    /**
     * Get the UUID of all automations the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedAutomationUUIDs() {
        if (!DEVELOPMENT || !this.__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids = await this.connection.server.storage.getItem('Automations') || [];

        return uuids;
    }

    /**
     * Check if the user can create automations.
     *
     * @return {Promise<boolean>}
     */
    checkCanCreateAutomations() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanCreateAutomations() {
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
    checkCanGetAutomation(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetAutomation(uuid) {
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
    checkCanSetAutomation(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetAutomation(uuid) {
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
    checkCanDeleteAutomation(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanDeleteAutomation(uuid) {
        if (!await this.checkCanDeleteAutomation(uuid)) {
            throw new Error('You don\'t have permission to delete this automation');
        }
    }

    /**
     * Get the UUID of all scenes the user can see.
     *
     * @return {Promise<Array>}
     */
    async getAuthorisedSceneUUIDs() {
        if (!DEVELOPMENT || !this.__development_allow_local()) {
            if (!this.user) return [];
        }

        const uuids = await this.connection.server.storage.getItem('Scenes') || [];

        return uuids;
    }

    /**
     * Check if the user can create scenes.
     *
     * @return {Promise<boolean>}
     */
    checkCanCreateScenes() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanCreateScenes() {
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
    checkCanGetScene(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetScene(uuid) {
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
    checkCanActivateScene(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanActivateScene(uuid) {
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
    checkCanSetScene(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetScene(uuid) {
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
    checkCanDeleteScene(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanDeleteScene(uuid) {
        if (!await this.checkCanDeleteScene(uuid)) {
            throw new Error('You don\'t have permission to delete this scene');
        }
    }

    /**
     * Check if the user can create HAP bridges.
     *
     * @return {Promise<boolean>}
     */
    checkCanCreateBridges() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanCreateBridges() {
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
    checkCanGetBridgeConfiguration(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetBridgeConfiguration(uuid) {
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
    checkCanSetBridgeConfiguration(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetBridgeConfiguration(uuid) {
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
    checkCanDeleteBridge(uuid) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanDeleteBridge(uuid) {
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
    checkCanGetPairing(username) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanGetPairing(username) {
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
    checkCanSetPairing(username) {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanSetPairing(username) {
        if (!await this.checkCanSetPairing(username)) {
            throw new Error('You don\'t have permission to update this pairing');
        }
    }

    /**
     * Check if the user can manage the server.
     *
     * @return {Promise<boolean>}
     */
    checkCanAccessServerRuntimeInfo() {
        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }

    async assertCanAccessServerRuntimeInfo() {
        if (!await this.checkCanAccessServerRuntimeInfo()) {
            throw new Error('You don\'t have permission to manage this home');
        }
    }

    /**
     * Check if the user should receive a broadcast message.
     *
     * @param {Object} data
     * @param {string} data.type
     * @return {Promise<boolean>}
     */
    checkShouldReceiveBroadcast(data) {
        if (data.type === 'add-accessories') {
            return Promise.all(data.ids.map(uuid => this.checkCanGetAccessory(uuid))).then(g => !g.find(g => !g));
        }
        if (data.type === 'remove-accessories') {
            return Promise.all(data.ids.map(uuid => this.checkCanGetAccessory(uuid))).then(g => !g.find(g => !g));
        }
        if (data.type === 'update-characteristic') return this.checkCanGetAccessory(data.accessory_uuid);
        if (data.type === 'update-accessory-data') return this.checkCanGetAccessory(data.uuid);
        if (data.type === 'update-home-settings') return this.checkCanGetHomeSettings();
        if (['new-layout', 'update-layout', 'remove-layout'].includes(data.type)) {
            return this.checkCanGetLayout(data.uuid);
        }
        if (['new-layout-section', 'update-layout-section', 'remove-layout-section'].includes(data.type)) {
            return this.checkCanGetLayout(data.layout_uuid);
        }
        if (data.type === 'update-pairings') {
            return this.checkCanGetAccessory(data.bridge_uuid) && this.checkCanAccessServerRuntimeInfo();
        }
        if (data.type === 'update-pairing-data') {
            return this.checkCanGetPairing(data.id) && this.checkCanAccessServerRuntimeInfo();
        }

        if (DEVELOPMENT && this.__development_allow_local()) return true;

        if (!this.user) return false;

        return true;
    }
}

if (DEVELOPMENT) {
    const local_addresses = ['::1', '::ffff:127.0.0.1', '127.0.0.1'];

    Permissions.prototype.__development_allow_local = function() {
        if (local_addresses.includes(this.connection.req.connection.remoteAddress) &&
            !this.connection.req.headers['x-forwarded-for']
        ) {
            return true;
        }
    };
}
