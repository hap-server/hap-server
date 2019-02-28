import EventEmitter from 'events';

import Vue from 'vue';

import Service from './service';

export default class Accessory extends EventEmitter {
    /**
     * Creates an Accessory.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} details The HAP accessory data (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     */
    constructor(connection, uuid, details, data) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this.services = {};
        this._setData(data || {});
        this._setDetails(details || {});

        // this.services.push(new Service(this, 'test', {type: '00000049-0000-1000-8000-0026BB765291'}));

        // this._updateServicesFrom(details);
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
        const added_service_details = [];
        const removed_service_ids = [];

        for (const service_details of details.services || []) {
            const uuid = service_details.type + (service_details.subtype ? '.' + service_details.subtype : '');
            const service = this.services[uuid];

            // Service doesn't already exist
            if (!service) {
                added_service_details.push(service_details);
                continue;
            }

            service._setDetails(service_details);
        }

        for (const service_uuid of Object.keys(this.services)) {
            const service_type = service_uuid.indexOf('.') !== -1 ?
                service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
            const service_subtype = service_uuid.indexOf('.') !== -1 ?
                service_uuid.substr(service_uuid.indexOf('.') + 1) : undefined;

            // Service still exists
            if (details.services.find(s => s.type === service_type
                && (!s.subtype && !service_subtype) || s.subtype === service_subtype)) continue;

            removed_service_ids.push(service_uuid);
        }

        const added_services = added_service_details.map(service_details => {
            const uuid = service_details.type + (service_details.subtype ? '.' + service_details.subtype : '');
            return new Service(this, uuid, service_details, this.data['Service.' + uuid]);
        });

        for (const service of added_services) {
            // Use Vue.set so Vue updates properly
            Vue.set(this.services, service.uuid, service);
            this.emit('new-service', service);
        }

        if (added_services.length) this.emit('new-services', added_services);

        const removed_services = removed_service_ids.map(uuid => this.services[uuid]);

        for (const service of removed_services) {
            // Use Vue.delete so Vue updates properly
            Vue.delete(this.services, service.uuid);
            this.emit('removed-service', service);
        }

        if (removed_services.length) this.emit('removed-services', removed_services);

        if (added_services.length || removed_services.length) {
            this.emit('updated-services', added_services, removed_services);
        }
    }

    get data() {
        return this._data;
    }

    _setData(data, here) {
        this._data = Object.freeze(data);

        for (const key of Object.keys(data).filter(key => key.startsWith('Service.'))) {
            const service_uuid = key.substr(8);
            const service = this.services[service_uuid];

            if (!service) continue;

            service._setData(data[key], here);
        }

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
        return this.getCharacteristicValue(
            '0000003E-0000-1000-8000-0026BB765291', '00000023-0000-1000-8000-0026BB765291');
    }

    findService(callback) {
        for (const service of Object.values(this.services)) {
            if (callback.call(this, service)) return service;
        }
    }

    findServices(callback) {
        const services = [];

        for (const service of Object.values(this.services)) {
            if (callback.call(this, service)) services.push(service);
        }

        return services;
    }

    getService(uuid) {
        return this.services[uuid];
    }

    get accessory_information() {
        return this.getService('0000003E-0000-1000-8000-0026BB765291');
    }

    getCharacteristic(service_uuid, characteristic_uuid) {
        if (!this.services[service_uuid]) return;
        if (!this.services[service_uuid].characteristics[characteristic_uuid]) return;

        return this.services[service_uuid].characteristics[characteristic_uuid];
    }

    getCharacteristicValue(service_uuid, characteristic_uuid) {
        const characteristic = this.getCharacteristic(service_uuid, characteristic_uuid);
        if (!characteristic) return;

        return characteristic.value;
    }
}
