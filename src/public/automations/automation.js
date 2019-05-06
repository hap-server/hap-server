import EventEmitter from 'events';
import isEqual from 'lodash.isequal';

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

        this.connection = connection;
        this.uuid = uuid;
        this._setPermissions(permissions || {});
        this._setData(data || {});
    }

    get live() {
        return this;
    }

    get staged() {
        return Object.defineProperty(this, 'staged', {value: new StagedAutomation(this)}).staged;
    }

    get changed() {
        return isEqual(this.live.data, this.staged.data);
    }

    _setData(data) {
        if (!this.changed) this.staged._setData(data);

        this.data = Object.freeze(data);

        this.emit('data-updated');
    }

    async updateData(data) {
        await this.connection.setAutomation(this.uuid, data);
        this._setData(data);
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
    constructor(automation) {
        super(automation.connection, automation.uuid, automation.data);

        this.automation = automation;
    }

    get live() {
        return this.automation;
    }

    get staged() {
        return this;
    }

    get connection() { return this.automation.connection; }
    set connection(connection) {}

    get uuid() { return this.automation.uuid; }
    set uuid(uuid) {}

    get _permissions() { return this.automation._permissions; }
    set _permissions(_permissions) {}

    _setData(data) {
        this.data = data;
    }

    updateData(data) {
        //
    }

    save() {
        return this.automation.updateData(this.data);
    }
}
