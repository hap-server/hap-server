import {EventEmitter} from 'events';
import Connection from './connection';

import {Scene as SceneData} from '../common/types/storage';
import {CheckScenesActiveResponseMessage, GetScenesPermissionsResponseMessage} from '../common/types/messages';
import {
    SceneActivatingMessage, SceneActivatedMessage, SceneDeactivatingMessage, SceneDeactivatedMessage, SceneProgressMessage,
} from '../common/types/broadcast-messages';

class Scene extends EventEmitter {
    connection: Connection;
    readonly uuid: string;

    activating = false;
    activating_progress = 0;
    deactivating = false;
    deactivating_progress = 0;

    data!: SceneData;
    _permissions!: GetScenesPermissionsResponseMessage[0];
    _active: CheckScenesActiveResponseMessage[0];

    /**
     * Creates a Scene.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     * @param {boolean} active
     * @param {object} permissions
     */
    constructor(
        connection: Connection, uuid: string, data: SceneData, active: CheckScenesActiveResponseMessage[0],
        permissions: GetScenesPermissionsResponseMessage[0]
    ) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this._setData(data || {});
        this._setPermissions(permissions || {get: false, activate: false, set: false, delete: false});

        this._active = active;
    }

    _setData(data: SceneData) {
        this.data = Object.freeze(data);

        this.emit('updated-data', data);
    }

    async updateData(data: SceneData) {
        await this.connection.setScene(this.uuid, data);
        this._setData(data);
    }

    _setPermissions(permissions: GetScenesPermissionsResponseMessage[0]) {
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

    _handleActivating(data: SceneActivatingMessage) {
        this._active = false;
        this.activating = true;
        this.activating_progress = 0;
        this.emit('activating');
    }

    _handleActivated(data: SceneActivatedMessage) {
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

    _handleDeactivating(data: SceneDeactivatingMessage) {
        this._active = true;
        this.deactivating = true;
        this.deactivating_progress = 0;
        this.emit('deactivating');
    }

    _handleDeactivated(data: SceneDeactivatedMessage) {
        if (!this.active) return;

        this._active = false;
        this.deactivating = false;
        this.deactivating_progress = 0;
        this.emit('deactivated');
    }

    _handleProgress(data: SceneProgressMessage) {
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

type SceneEvents = {
    'updated-data': (this: Scene, data: SceneData) => void;
    'updated-permissions': (this: Scene, permissions: GetScenesPermissionsResponseMessage[0]) => void;

    'activating': (this: Scene) => void;
    'activated': (this: Scene) => void;
    'deactivating': (this: Scene) => void;
    'deactivated': (this: Scene) => void;
    'activating-progress': (this: Scene, progress: number) => void;
    'deactivating-progress': (this: Scene, progress: number) => void;
};

interface Scene {
    addListener<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    on<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    once<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    prependListener<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    prependOnceListener<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    removeListener<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    off<E extends keyof SceneEvents>(event: E, listener: SceneEvents[E]): this;
    removeAllListeners<E extends keyof SceneEvents>(event: E): this;
    listeners<E extends keyof SceneEvents>(event: E): SceneEvents[E][];
    rawListeners<E extends keyof SceneEvents>(event: E): SceneEvents[E][];

    emit<E extends keyof SceneEvents>(event: E, ...data: any[]): boolean;

    listenerCount<E extends keyof SceneEvents>(type: E): number;
}

export default Scene;
