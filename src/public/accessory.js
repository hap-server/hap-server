import EventEmitter from 'events';

import Vue from 'vue';

import Service, {collapsed_services} from './service';
import CollapsedService from './collapsed-service';

import service_components from './components/services';

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
        this.display_services = [];
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

        this._updateDisplayServices(added_services, removed_services);

        if (added_services.length || removed_services.length) {
            this.emit('updated-services', added_services, removed_services);
        }
    }

    _updateDisplayServices(added_services, removed_services) {
        const added_display_services = [];
        const removed_display_services = [];
        const removed_collapsed_service_types = {};

        for (const service of added_services) {
            if (service_components.has(service.type)) {
                added_display_services.push(service);
                continue;
            }

            const collapsed_service_type = service.collapse_to;

            if (collapsed_service_type) {
                let collapsed_service = added_display_services.find(service => service instanceof CollapsedService &&
                    service.collapsed_service_type === collapsed_service_type) ||
                    this.display_services.find(service => service instanceof CollapsedService &&
                        service.collapsed_service_type === collapsed_service_type);
                if (!collapsed_service) {
                    collapsed_service = new CollapsedService(this, collapsed_service_type, collapsed_service_type,
                        this.data['CollapsedService.' + collapsed_service_type]);
                    added_display_services.push(collapsed_service);
                }

                collapsed_service.addService(service);
                continue;
            }
        }

        for (const service of removed_services) {
            if (service_components.has(service.type)) {
                removed_display_services.push(service);
                continue;
            }

            const collapsed_service_type = service.collapse_to;

            if (collapsed_service_type) {
                let removed_collapsed_services = removed_collapsed_service_types[collapsed_service_type];
                if (!removed_collapsed_services) removed_collapsed_services =
                    removed_collapsed_service_types[collapsed_service_type] = [];

                removed_collapsed_services.push(service);
            }
        }

        for (const service of added_display_services) {
            this.display_services.push(service);
            this.emit('new-display-service', service);

            console.log('Added display service', service.name, 'to', this.name, service, this);
        }

        if (added_display_services.length) this.emit('new-display-services', added_display_services);

        for (const [collapsed_service_type, removed_collapsed_services] of Object.entries(removed_collapsed_service_types)) {
            const collapsed_service = this.display_services.find(service => service instanceof CollapsedService &&
                service.collapsed_service_type === collapsed_service_type);

            if (removed_collapsed_services.length === collapsed_service.services.length) {
                removed_display_services.push(collapsed_service);
            } else {
                collapsed_service.removeService(...removed_collapsed_services);
            }
        }

        for (const service of removed_display_services) {
            let index;
            while (index = this.display_services.indexOf(service)) this.display_services.splice(index, 1);
            this.emit('removed-display-service', service);
        }

        if (removed_display_services.length) this.emit('removed-display-services', removed_display_services);

        if (added_display_services.length || removed_display_services.length) {
            this.emit('updated-display-services', added_display_services, removed_display_services);
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

        for (const key of Object.keys(data).filter(key => key.startsWith('CollapsedService.'))) {
            const service_uuid = key.substr(8);
            const service = this.display_services[service_uuid];

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
