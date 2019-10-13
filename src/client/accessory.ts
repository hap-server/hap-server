import EventEmitter from 'events';

import {$set, $delete} from './client';
import Connection from './connection';
import CollapsedService from './collapsed-service';
import Service, {type_uuids as service_types} from './service';

// Types
import {Component} from 'vue';
import ComponentRegistry from '../public/component-registry';

export default class Accessory extends EventEmitter {
    connection: Connection;
    readonly uuid: string;
    readonly services: {[key: string]: Service};
    readonly display_services: Service[];

    private _details;
    private _data;
    private _permissions;

    /**
     * Creates an Accessory.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} details The HAP accessory data (read only)
     * @param {object} data Configuration data stored by the web UI (read/write)
     * @param {object} permissions
     */
    constructor(connection: Connection, uuid: string, details, data, permissions) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this.services = {};
        this.display_services = [];
        this._setPermissions(permissions || {});
        this._setData(data || {});
        this._setDetails(details || {});
    }

    static get service_components(): ComponentRegistry<Component> | Map<string | number, Component> {
        try {
            return require('../public/component-registry').ServiceTileComponents;
        } catch (err) {
            return new Map();
        }
    }

    get details() {
        return this._details;
    }

    _setDetails(details, dont_update_services = false) {
        if (!dont_update_services) this._updateServicesFrom(details);

        this._details = Object.freeze(details);

        this.emit('details-updated');
        this.emit('updated');
    }

    private _updateServicesFrom(details) {
        const added_service_details = [];
        const removed_service_ids = [];
        const services_by_details = new Map();
        const primary_services = [];
        const services_made_visible = [];
        const services_made_hidden = [];

        for (const service_details of details.services || []) {
            const uuid = service_details.type + (service_details.subtype ? '.' + service_details.subtype : '');
            const service = this.services[uuid];

            if (service_details.primary) primary_services.push(uuid);

            // Service doesn't already exist
            if (!service) {
                added_service_details.push(service_details);
                continue;
            }

            services_by_details.set(service_details, service);

            const was_hidden = service.hidden;

            service._setDetails(service_details);

            if (service.hidden !== was_hidden && service.hidden) {
                services_made_visible.push(service);
            } else if (service.hidden !== was_hidden) {
                services_made_hidden.push(service);
            }
        }

        if (primary_services.length > 1) {
            console.warn('Accessory %O has multiple primary services. The first will be used as the primary service.',
                this, primary_services);
        }

        for (const service_uuid of Object.keys(this.services)) {
            const service_type = service_uuid.indexOf('.') !== -1 ?
                service_uuid.substr(0, service_uuid.indexOf('.')) : service_uuid;
            const service_subtype = service_uuid.indexOf('.') !== -1 ?
                service_uuid.substr(service_uuid.indexOf('.') + 1) : undefined;

            // Service still exists
            if (details.services && details.services.find(s => s.type === service_type
                && (!s.subtype && !service_subtype) || s.subtype === service_subtype)) continue;

            removed_service_ids.push(service_uuid);
        }

        const added_services = added_service_details.map(service_details => {
            const uuid = service_details.type + (service_details.subtype ? '.' + service_details.subtype : '');
            const permissions = this._permissions.set_characteristics[uuid];
            const service = new Service(this, uuid, service_details, this.data['Service.' + uuid], permissions);
            services_by_details.set(service_details, service);
            return service;
        });

        // Add linked services for new services
        // eslint-disable-next-line guard-for-in
        for (const index in added_service_details) {
            const service_details = added_service_details[index];
            const service = added_services[index];

            for (const linked_service_index of service_details.linked_indexes || []) {
                const linked_service_details = details.services[linked_service_index];
                if (!linked_service_details) {
                    console.warn('Service %O linked with a service that doesn\'t exist at index %n',
                        service, linked_service_index);
                    continue;
                }

                const linked_service = services_by_details.get(linked_service_details);

                // If this service is in the linked services list twice for whatever reason
                if (service.linked_services.includes(linked_service)) continue;

                service.linked_services.push(linked_service);
            }
        }

        // Update linked services for existing services
        for (const service_details of details.services || []) {
            const uuid = service_details.type + (service_details.subtype ? '.' + service_details.subtype : '');
            const service = this.services[uuid];

            // Service is new
            if (!service) continue;

            for (const linked_service_index of service_details.linked_indexes || []) {
                const linked_service_details = details.services[linked_service_index];
                if (!linked_service_details) {
                    console.warn('Service %O linked with a service that doesn\'t exist at index %n',
                        service, linked_service_index);
                    continue;
                }

                const linked_service = services_by_details.get(linked_service_details);

                // Already linked
                if (service.linked_services.includes(linked_service)) continue;

                service._handleAddLinkedService(service);
            }

            for (const linked_service of service.linked_services) {
                if (removed_service_ids.includes(linked_service.uuid)) {
                    // Linked service was removed
                    service._handleRemoveLinkedService(linked_service, true);
                } else if (!(service_details.linked_indexes || []).find(linked_service_index => {
                    const linked_service_details = details.services[linked_service_index];
                    if (!linked_service_details) return false;

                    return !!services_by_details.get(linked_service_details);
                })) {
                    // Linked service was unlinked
                    service._handleRemoveLinkedService(linked_service, false);
                }
            }
        }

        for (const service of added_services) {
            // Use Vue.set so Vue updates properly
            $set(this.services, service.uuid, service);
            this.emit('new-service', service);
        }

        if (added_services.length) this.emit('new-services', added_services);

        const removed_services = removed_service_ids.map(uuid => this.services[uuid]);

        for (const service of removed_services) {
            // Use Vue.delete so Vue updates properly
            $delete(this.services, service.uuid);
            this.emit('removed-service', service);
        }

        if (removed_services.length) this.emit('removed-services', removed_services);

        this._updateDisplayServices(
            added_services.filter(s => !s.hidden).concat(services_made_visible),
            removed_services.filter(s => s.hidden).concat(services_made_hidden)
        );

        if (added_services.length || removed_services.length) {
            this.emit('updated-services', added_services, removed_services);
        }
    }

    private _updateDisplayServices(added_services: Service[], removed_services: Service[]) {
        const added_display_services = [];
        const removed_display_services = [];
        const removed_collapsed_service_types = {};

        for (const service of added_services) {
            if ((this.constructor as typeof Accessory).service_components.has(service.type)) {
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
            if ((this.constructor as typeof Accessory).service_components.has(service.type)) {
                removed_display_services.push(service);
                continue;
            }

            const collapsed_service_type = service.collapse_to;

            if (collapsed_service_type) {
                let removed_collapsed_services = removed_collapsed_service_types[collapsed_service_type];
                if (!removed_collapsed_services) {
                    removed_collapsed_services = removed_collapsed_service_types[collapsed_service_type] = [];
                }

                removed_collapsed_services.push(service);
            }
        }

        for (const service of added_display_services) {
            this.display_services.push(service);
            this.emit('new-display-service', service);

            // console.log('Added display service', service.name, 'to', this.name, service, this);
        }

        if (added_display_services.length) this.emit('new-display-services', added_display_services);

        for (const [collapsed_service_type, removed_collapsed_services] of
            Object.entries(removed_collapsed_service_types)
        ) {
            const collapsed_service = this.display_services.find(service => service instanceof CollapsedService &&
                service.collapsed_service_type === collapsed_service_type) as CollapsedService;

            if ((removed_collapsed_services as Array<any>).length === collapsed_service.services.length) {
                removed_display_services.push(collapsed_service);
            } else {
                collapsed_service.removeService(...removed_collapsed_services as Array<any>);
            }
        }

        for (const service of removed_display_services) {
            let index;
            while ((index = this.display_services.indexOf(service)) > -1) this.display_services.splice(index, 1);
            this.emit('removed-display-service', service);
        }

        if (removed_display_services.length) this.emit('removed-display-services', removed_display_services);

        if (added_display_services.length || removed_display_services.length) {
            this.emit('updated-display-services', added_display_services, removed_display_services);
        }
    }

    refreshDisplayServices() {
        const services = [];

        for (const service of Object.values(this.services)) {
            if (service.hidden) continue;

            if (this.display_services.find(display_service => {
                if (service === display_service) return true;

                if (display_service instanceof CollapsedService &&
                    display_service.services.includes(service)) return true;

                return false;
            })) continue;

            services.push(service);
        }

        // Call updateDisplayServices with services that aren't displayed
        this._updateDisplayServices(services, []);
    }

    get primary_service(): Service {
        for (const service of Object.values(this.services)) {
            if (!service.details.primary) continue;

            return service;
        }

        return null;
    }

    get data() {
        return this._data;
    }

    _setData(data, here?) {
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

    get configured_name(): string {
        return this.data.name;
    }

    get default_name(): string {
        return this.getCharacteristicValue(
            '0000003E-0000-1000-8000-0026BB765291', '00000023-0000-1000-8000-0026BB765291');
    }

    _setPermissions(permissions) {
        permissions.get = !!permissions.get;
        permissions.set = !!permissions.set;
        permissions.set_characteristics = permissions.set_characteristics || {};

        this._permissions = Object.freeze(permissions);

        for (const service of Object.values(this.services)) {
            service._setPermissions(permissions.set_characteristics[service.uuid] || []);
        }

        this.emit('permissions-updated', permissions);
    }

    get can_get(): boolean {
        return this._permissions.get;
    }

    get can_set(): boolean {
        return this._permissions.set;
    }

    findService(callback: (service: Service) => boolean) {
        for (const service of Object.values(this.services)) {
            if (callback.call(this, service)) return service;
        }
    }

    findServices(callback: (service: Service) => boolean) {
        const services: Service[] = [];

        for (const service of Object.values(this.services)) {
            if (callback.call(this, service)) services.push(service);
        }

        return services;
    }

    getService(uuid: string, include_display_services = false) {
        return this.services[uuid] ? this.services[uuid] :
            include_display_services ? this.display_services.find(s => s.uuid === uuid) : null;
    }

    getServiceByName(name: string) {
        return this.services[service_types[name]];
    }

    get accessory_information() {
        return this.getService('0000003E-0000-1000-8000-0026BB765291');
    }

    getCharacteristic(service_uuid: string, characteristic_uuid: string) {
        if (!this.services[service_uuid]) return;
        if (!this.services[service_uuid].characteristics[characteristic_uuid]) return;

        return this.services[service_uuid].characteristics[characteristic_uuid];
    }

    getCharacteristicValue(service_uuid: string, characteristic_uuid: string) {
        const characteristic = this.getCharacteristic(service_uuid, characteristic_uuid);
        if (!characteristic) return;

        return characteristic.value;
    }
}
