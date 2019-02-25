import EventEmitter from 'events';

export default class Service extends EventEmitter {
    /**
     * Creates a Service.
     *
     * @param {Accessory} accessory
     * @param {string} uuid
     * @param {object} details The accessory exposed to Homebridge (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     */
    constructor(connection, uuid, details, data) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this.details = details;
        this.data = data;
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
