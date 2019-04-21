import EventEmitter from 'events';

export default class Layout extends EventEmitter {
    /**
     * Creates a Layout.
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
        this.sections = [];
        this._setData(data || {});
        this._setPermissions(permissions || {});
    }

    _setData(data) {
        this.data = Object.freeze(data);

        this._updateSectionsFrom(data);

        this.emit('updated-data', data);
    }

    _updateSectionsFrom(data) {
        this.sections = data.sections || [];
    }

    async updateData(data) {
        await this.connection.setLayout(this.uuid, data);
        this._setData(data);
    }

    get name() {
        return this.data.name;
    }

    _setPermissions(permissions) {
        permissions.get = !!permissions.get;
        permissions.set = !!permissions.set;
        permissions.delete = !!permissions.delete;

        this._permissions = Object.freeze(permissions);

        this.emit('updated-permissions', permissions);
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
