import EventEmitter from 'events';

import {$set, $delete} from './client';
import Connection from './connection';

export default class Layout extends EventEmitter {
    connection: Connection;
    readonly uuid: string;
    sections: {[key: string]: LayoutSection};
    staged_sections_order: string[];

    data;
    _permissions;

    /**
     * Creates a Layout.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     * @param {object} sections
     * @param {object} permissions
     */
    constructor(connection, uuid, data, sections, permissions) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this.sections = {};
        this._setData(data || {});
        this._setPermissions(permissions || {});
        this._updateSectionsFrom(sections || {});
    }

    _setData(data) {
        this.data = Object.freeze(data);

        this.emit('updated-data', data);
    }

    _updateSectionsFrom(sections) {
        // TODO: this
        this.sections = Object.keys(sections).map(uuid => new LayoutSection(this, uuid, sections[uuid]))
            .reduce((acc, section) => (acc[section.uuid] = section, acc), {});
    }

    async updateData(data) {
        await this.connection.setLayout(this.uuid, data);
        this._setData(data);
    }

    get name() {
        return this.data.name;
    }

    get background_url() {
        return this.data.background_url;
    }

    get sections_order() {
        return this.data.sections_order;
    }

    _setPermissions(permissions) {
        permissions.get = !!permissions.get;
        permissions.set = !!permissions.set;
        permissions.delete = !!permissions.delete;

        this._permissions = Object.freeze(permissions);

        this.emit('updated-permissions', permissions);
    }

    get can_get(): boolean {
        return this._permissions.get;
    }

    get can_set(): boolean {
        return this._permissions.set;
    }

    get can_delete(): boolean {
        return this._permissions.delete;
    }

    /**
     * Create a new section.
     *
     * @param {object} [data]
     * @param {number} [index]
     * @return {Promise<LayoutSection>}
     */
    async addSection(data, index) {
        const [uuid] = await this.connection.createLayoutSection(this.uuid, data || {});

        const section = new LayoutSection(this, uuid, data || {});

        // Use Vue.set so Vue updates properly
        $set(this.sections, uuid, section);

        if (typeof index !== 'undefined') {
            const sections_order = this.staged_sections_order || this.sections_order || [];

            await this.updateData(Object.assign({}, this.data, {
                sections_order: sections_order.slice(index, 0, uuid),
            }));
        }

        return section;
    }

    _handleNewLayoutSection(uuid, data) {
        // Use Vue.set so Vue updates properly
        $set(this.sections, uuid, new LayoutSection(this, uuid, data || {}));
    }

    /**
     * Deletes a section.
     *
     * @param {LayoutSection} section
     * @return {Promise}
     */
    async deleteSection(section) {
        await this.connection.deleteLayoutSection(this.uuid, section.uuid);
        $delete(this.sections, section.uuid);

        const sections_order = this.staged_sections_order || this.sections_order || [];

        if (sections_order.includes(section.uuid)) {
            await this.updateData(Object.assign({}, this.data, {
                sections_order: this.staged_sections_order = sections_order.filter(s => s.uuid !== section.uuid),
            }));
        }
    }

    _handleRemoveLayoutSection(uuid) {
        // Use Vue.set so Vue updates properly
        $delete(this.sections, uuid);
    }
}

export class LayoutSection extends EventEmitter {
    readonly layout: Layout;
    readonly uuid: string;
    readonly unavailable_service_placeholders: {};

    data;
    staged_data?;
    
    /**
     * Creates a LayoutSection.
     *
     * @param {Layout} layout
     * @param {string} uuid
     * @param {object} data
     */
    constructor(layout, uuid, data) {
        super();

        this.layout = layout;
        this.uuid = uuid;
        this.unavailable_service_placeholders = {};
        this._setData(data || {});
    }

    _setData(data) {
        if (!data.accessories) data.accessories = [];

        this.data = Object.freeze(data);
        this.staged_data = null;

        this.emit('updated-data', data);
    }

    async updateData(data) {
        this.staged_data = Object.freeze(data);
        await this.layout.connection.setLayoutSection(this.layout.uuid, this.uuid, data);
        this._setData(data);
    }

    get name() {
        return this.data.name;
    }

    get accessories() {
        return this.data.accessories;
    }

    get can_get() {
        return this.layout.can_get;
    }

    get can_set() {
        return this.layout.can_set;
    }

    get can_delete() {
        return this.layout.can_set;
    }
}
