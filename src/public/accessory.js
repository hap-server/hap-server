import EventEmitter from 'events';

import Vue from 'vue';

import Service from './service';

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

        for (let service_details of details.services) {
            const service = this.services[service_details.iid];

            // Service doesn't already exist
            if (!service) {
                added_service_details.push(service_details);
                continue;
            }

            service._setDetails(service_details);
        }

        for (let service_id of Object.keys(this.services)) {
            // Service still exists
            if (details.services.find(s => s.iid === service_id)) continue;

            removed_service_ids.push(service_id);
        }

        // Should the service iid be used as a permanent identifier for this service?
        const added_services = added_service_details.map(sd =>
            new Service(this, sd.iid, sd, this.data['Service.' + sd.iid]));

        for (let service of added_services) {
            // Use Vue.set so Vue updates properly
            Vue.set(this.services, service.uuid, service);
            this.emit('new-service', service);
        }

        if (added_services.length) this.emit('new-services', added_services);

        const removed_services = removed_service_ids.map(id => this.services[id]);

        for (let service of removed_services) {
            // Use Vue.delete so Vue updates properly
            Vue.delete(this.services, service.uuid);
            this.emit('removed-service', service);
        }

        if (removed_services.length) this.emit('removed-services', removed_services);

        if (added_services.length || removed_services.length) this.emit('updated-services', added_services, removed_services);
    }

    get data() {
        return this._data;
    }

    _setData(data, here) {
        this._data = Object.freeze(data);

        for (let key of Object.keys(data).filter(key => key.startsWith('Service.'))) {
            const service_id = key.substr(8);
            const service = this.services[service_id];

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
        const accessory_information = this.getService('0000003E-0000-1000-8000-0026BB765291');
        const name = accessory_information.getCharacteristic('00000023-0000-1000-8000-0026BB765291');

        return name.value;
    }

    findService(callback) {
        for (let service of Object.values(this.services)) {
            if (callback.call(this, service)) return service;
        }
    }

    findServices(callback) {
        const services = [];

        for (let service of Object.values(this.services)) {
            if (callback.call(this, service)) services.push(service);
        }

        return services;
    }

    getService(type) {
        return this.findService(service => service.type === type);
    }
}
