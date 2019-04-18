
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
        if (!this.user) return [];

        const uuids = [];

        for (const bridge of this.server.bridges) {
            uuids.push(bridge.uuid);
        }

        for (const accessory of this.server.accessories) {
            uuids.push(accessory.uuid);
        }

        for (const accessory of this.server.cached_accessories) {
            uuids.push(accessory.uuid);
        }

        for (const bridge of this.server.bridges) {
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
        if (!this.user) return false;

        return true;
    }

    async assertCanGetAccessory(accessory_uuid) {
        if (!await this.checkCanGetAccessory(accessory_uuid)) throw new Error('You don\'t have permission to access this accessory');
    }

    /**
     * Check if the user can control an accessory.
     *
     * @param {string} accessory_uuid
     * @param {string} service_uuid
     * @param {string} characteristic_uuid
     * @param {} value
     * @return {Promise<boolean>}
     */
    checkCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        if (!this.user) return false;

        return true;
    }

    async assertCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value) {
        if (!await this.checkCanSetCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, value)) throw new Error('You don\'t have permission to control this accessory');
    }

    /**
     * Check if the user can manage an accessory.
     *
     * @param {string} accessory_uuid
     * @return {Promise<boolean>}
     */
    checkCanSetAccessoryData(accessory_uuid) {
        if (!this.user) return false;

        return true;
    }

    async assertCanSetAccessoryData(accessory_uuid) {
        if (!await this.checkCanSetAccessoryData(accessory_uuid)) throw new Error('You don\'t have permission to manage this accessory');
    }

    /**
     * Check if the user can access this home's settings.
     *
     * @return {Promise<boolean>}
     */
    checkCanGetHomeSettings() {
        if (!this.user) return false;

        return true;
    }

    async assertCanGetHomeSettings() {
        if (!await this.checkCanGetHomeSettings()) throw new Error('You don\'t have permission to access this home');
    }

    /**
     * Check if the user manage this home's settings.
     *
     * @return {Promise<boolean>}
     */
    checkCanSetHomeSettings() {
        if (!this.user) return false;

        return true;
    }

    async assertCanSetHomeSettings() {
        if (!await this.checkCanSetHomeSettings()) throw new Error('You don\'t have permission to manage this home');
    }

    /**
     * Check if the user can manage the server.
     *
     * @return {Promise<boolean>}
     */
    checkCanAccessServerRuntimeInfo() {
        if (!this.user) return false;

        return true;
    }

    async assertCanAccessServerRuntimeInfo() {
        if (!await this.checkCanAccessServerRuntimeInfo()) throw new Error('You don\'t have permission to manage this home');
    }

    /**
     * Check if the user should receive a broadcast message.
     *
     * @param {Object} data
     * @param {string} data.type
     * @return {Promise<boolean>}
     */
    checkShouldReceiveBroadcast(data) {
        if (data.type === 'update-characteristic') return this.checkCanGetAccessory(data.accessory_uuid);

        if (!this.user) return false;

        return true;
    }
}
