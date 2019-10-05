import EventEmitter from 'events';
import Connection from './connection';

export default class Scene extends EventEmitter {
    connection: Connection;
    readonly uuid: string;

    activating = false;
    activating_progress = 0;
    deactivating = false;
    deactivating_progress = 0;

    data;
    _permissions;
    _active: boolean | {
        reject: boolean;
        error: boolean;
        constructor: any;
        data: any;
    };

    /**
     * Creates a Scene.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     * @param {boolean} active
     * @param {object} permissions
     */
    constructor(connection: Connection, uuid: string, data, active, permissions) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this._setData(data || {});
        this._setPermissions(permissions || {});

        this._active = active;
    }

    _setData(data) {
        this.data = Object.freeze(data);

        this.emit('updated-data', data);
    }

    async updateData(data) {
        await this.connection.setScene(this.uuid, data);
        this._setData(data);
    }

    _setPermissions(permissions) {
        permissions.get = !!permissions.get;
        permissions.activate = !!permissions.activate;
        permissions.set = !!permissions.set;
        permissions.delete = !!permissions.delete;

        this._permissions = Object.freeze(permissions);

        this.emit('updated-permissions', permissions);
    }

    get can_get(): boolean {
        return this._permissions.get;
    }

    get can_activate(): boolean {
        return this._permissions.activate;
    }

    get can_set(): boolean {
        return this._permissions.set;
    }

    get can_delete(): boolean {
        return this._permissions.delete;
    }

    get active() {
        return typeof this._active !== 'object' ? !!this._active : false;
    }

    get active_error() {
        return typeof this._active === 'object' ? this._active : null;
    }

    /**
     * Activates this scene.
     *
     * @return {Promise}
     */
    async activate() {
        try {
            this.activating = true;
            await this.connection.activateScene(this.uuid);
        } finally {
            this.activating = false;
        }
    }

    _handleActivating(data) {
        this._active = false;
        this.activating = true;
        this.activating_progress = 0;
        this.emit('activating');
    }

    _handleActivated(data) {
        if (this.active) return;

        this._active = true;
        this.activating = false;
        this.activating_progress = 0;
        this.emit('activated');
    }

    /**
     * Deactivates this scene.
     *
     * @return {Promise}
     */
    async deactivate() {
        try {
            this.deactivating = true;
            await this.connection.deactivateScene(this.uuid);
        } finally {
            this.deactivating = false;
        }
    }

    _handleDeactivating(data) {
        this._active = true;
        this.deactivating = true;
        this.deactivating_progress = 0;
        this.emit('deactivating');
    }

    _handleDeactivated(data) {
        if (!this.active) return;

        this._active = false;
        this.deactivating = false;
        this.deactivating_progress = 0;
        this.emit('deactivated');
    }

    _handleProgress(data) {
        if (this.activating) {
            this.activating_progress = data.progress;
            this.emit('activating-progress', data.progress);
        }

        if (this.deactivating) {
            this.deactivating_progress = data.progress;
            this.emit('deactivating-progress', data.progress);
        }
    }
}
