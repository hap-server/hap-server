import EventEmitter from 'events';
import isEqual from 'lodash.isequal';

let id = 0;

export default class Automation extends EventEmitter {
    /**
     * Creates an Automation.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     * @param {object} permissions
     */
    constructor(connection, uuid, data, permissions) {
        super();

        this.id = id++;

        this.connection = connection;
        this.uuid = uuid;
        this._setPermissions(permissions || {});
        this._setData(data || {});

        this.staged;
    }

    get live() {
        return this;
    }

    get staged() {
        return Object.defineProperty(this, 'staged', {enumerable: true, value: new StagedAutomation(this)}).staged;
    }

    get changed() {
        return !isEqual(this.live.data, this.staged.data);
    }

    get data() {
        return this._data;
    }

    get live_data() {
        return this.live.data;
    }

    get staged_data() {
        return this.staged.data;
    }

    _setData(data) {
        if (!this.staged.data || !this.changed) this.staged._setData(JSON.parse(JSON.stringify(data)));

        this._data = Object.freeze(data);

        this.emit('data-updated');
    }

    async updateData(data) {
        await this.connection.setAutomation(this.uuid, data);
        this._setData(data);
    }

    resetStagedAutomation() {
        this.staged._setData(JSON.parse(JSON.stringify(this.live.data)));
    }

    _setPermissions(permissions) {
        permissions.get = !!permissions.get;
        permissions.set = !!permissions.set;
        permissions.delete = !!permissions.delete;

        this._permissions = Object.freeze(permissions);

        this.emit('permissions-updated', permissions);
    }

    get can_get() {
        return this._permissions.get;
    }

    get can_set() {
        return this._permissions.set;
    }

    get can_delete() {
        return this._permissions.delete;
    }
}

export class StagedAutomation extends Automation {
    /**
     * Create a mutable automation.
     *
     * @param {Automation} automation
     */
    constructor(automation) {
        super(automation.connection, automation.uuid);

        this.automation = automation;
        this._data = JSON.parse(JSON.stringify(automation.live.data || null));
    }

    get live() {
        return this.automation;
    }

    get staged() {
        return this;
    }

    get id() {
        return this.automation.id;
    }
    set id(id) {}

    get connection() {
        return this.automation.connection;
    }
    set connection(connection) {}

    get uuid() {
        return this.automation.uuid;
    }
    set uuid(uuid) {}

    get _permissions() {
        return this.automation._permissions;
    }
    set _permissions(_permissions) {}

    _setData(data) {
        this._data = data;
    }

    updateData(data) {
        this._setData(data);
    }

    save() {
        if (!this.uuid) throw new Error('This automation doesn\'t exist');

        return this.automation.updateData(JSON.parse(JSON.stringify(this.data)));
    }
}
