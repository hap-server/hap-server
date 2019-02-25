import EventEmitter from 'events';

export default class Characteristic extends EventEmitter {
    /**
     * Creates a Characteristic.
     *
     * @param {Service} service
     * @param {string} uuid
     * @param {object} details The characteristic exposed to Homebridge (read only)
     */
    constructor(service, uuid, details) {
        super();

        this.service = service;
        this.uuid = uuid;
        this._setDetails(details || {});
    }

    get details() {
        return this._details;
    }

    _setDetails(details) {
        this._details = Object.freeze(details);

        this.emit('details-updated');
        this.emit('updated');
    }

    get description() {
        return this.details.description;
    }

    get type() {
        return this.details.type;
    }

    get perms() {
        return this.details.perms;
    }

    get format() {
        return this.details.format;
    }

    get value() {
        return this.details.value;
    }
}
