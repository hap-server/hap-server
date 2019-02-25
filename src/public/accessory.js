import EventEmitter from 'events';

export default class Accessory extends EventEmitter {
    /**
     * Creates an Accessory.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} details The accessory exposed to Homebridge (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     */
    constructor(connection, uuid, details, data) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this._setDetails(details);
        this._setData(data);

        this.services = [];

        this._updateServicesFrom(details);
    }

    get details() {
        return this._details;
    }

    _setDetails(details) {
        this._updateServicesFrom(details);

        this._details = Object.freeze(details);

        this.emit('details-updated');
        this.emit('updated');
    }

    _updateServicesFrom(details) {
        //
    }

    get data() {
        return this._data;
    }

    _setData(data, here) {
        this._data = Object.freeze(data);

        this.emit('data-updated', here);
        this.emit('updated', here);
    }

    async updateData(data) {
        await this.connection.setAccessoryData(this.uuid, data);
        this._setData(data, true);
    }

    get name() {
        return this.configured_name || this.default_name;
    }

    get configured_name() {
        return this.data.name;
    }

    get default_name() {
        return this.details.name;
    }
}
