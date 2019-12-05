import EventEmitter from 'events';

import {$set, $delete} from './client';
import Connection from './connection';

import {Layout as LayoutData, LayoutSection as LayoutSectionData} from '../common/types/storage';
import {GetLayoutsPermissionsResponseMessage} from '../common/types/messages';

class Layout extends EventEmitter {
    connection: Connection;
    readonly uuid: string;
    sections: {[key: string]: LayoutSection};
    staged_sections_order: string[];

    data: LayoutData;
    _permissions: GetLayoutsPermissionsResponseMessage[0];

    /**
     * Creates a Layout.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     * @param {object} sections
     * @param {object} permissions
     */
    constructor(connection: Connection, uuid: string, data: LayoutData, sections: {
        [uuid: string]: LayoutSectionData;
    }, permissions: GetLayoutsPermissionsResponseMessage[0]) {
        super();

        this.connection = connection;
        this.uuid = uuid;
        this.sections = {};
        this._setData(data || {});
        this._setPermissions(permissions || {get: false, set: false, delete: false});
        this._updateSectionsFrom(sections || {});
    }

    _setData(data: LayoutData) {
        this.data = Object.freeze(data);

        this.emit('updated-data', data);
    }

    _updateSectionsFrom(sections: {
        [uuid: string]: LayoutSectionData;
    }) {
        // TODO: this
        this.sections = Object.keys(sections).map(uuid => new LayoutSection(this, uuid, sections[uuid]))
            .reduce((acc: any, section) => (acc[section.uuid] = section, acc), {});
    }

    async updateData(data: LayoutData) {
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

    _setPermissions(permissions: GetLayoutsPermissionsResponseMessage[0]) {
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
    async addSection(data?: LayoutSectionData, index?: number) {
        const [uuid] = await this.connection.createLayoutSection(this.uuid, data || {});

        const section = new LayoutSection(this, uuid, data || {});

        // Use Vue.set so Vue updates properly
        $set(this.sections, uuid, section);

        if (typeof index !== 'undefined') {
            const sections_order = this.staged_sections_order || this.sections_order || [];

            await this.updateData(Object.assign({}, this.data, {
                sections_order: [...sections_order].splice(index, 0, uuid),
            }));
        }

        return section;
    }

    _handleNewLayoutSection(uuid: string, data: LayoutSectionData) {
        // Use Vue.set so Vue updates properly
        $set(this.sections, uuid, new LayoutSection(this, uuid, data || {}));
    }

    /**
     * Deletes a section.
     *
     * @param {LayoutSection} section
     * @return {Promise}
     */
    async deleteSection(section: LayoutSection) {
        await this.connection.deleteLayoutSection(this.uuid, section.uuid);
        $delete(this.sections, section.uuid);

        const sections_order = this.staged_sections_order || this.sections_order || [];

        if (sections_order.includes(section.uuid)) {
            await this.updateData(Object.assign({}, this.data, {
                sections_order: this.staged_sections_order = sections_order.filter(s => s !== section.uuid),
            }));
        }
    }

    _handleRemoveLayoutSection(uuid: string) {
        // Use Vue.set so Vue updates properly
        $delete(this.sections, uuid);
    }
}

type LayoutEvents = {
    'updated-data': (this: Layout, data: LayoutData) => void;
    'updated-permissions': (this: Layout, permissions: GetLayoutsPermissionsResponseMessage[0]) => void;
};

interface Layout {
    addListener<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    on<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    once<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    prependListener<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    prependOnceListener<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    removeListener<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    off<E extends keyof LayoutEvents>(event: E, listener: LayoutEvents[E]): this;
    removeAllListeners<E extends keyof LayoutEvents>(event: E): this;
    listeners<E extends keyof LayoutEvents>(event: E): LayoutEvents[E][];
    rawListeners<E extends keyof LayoutEvents>(event: E): LayoutEvents[E][];

    emit<E extends keyof LayoutEvents>(event: E, ...data: any[]): boolean;

    listenerCount<E extends keyof LayoutEvents>(type: E): number;
}

export default Layout;

class LayoutSection extends EventEmitter {
    readonly layout: Layout;
    readonly uuid: string;
    readonly unavailable_service_placeholders: {};

    data: LayoutSectionData;
    staged_data?: LayoutSectionData;

    /**
     * Creates a LayoutSection.
     *
     * @param {Layout} layout
     * @param {string} uuid
     * @param {object} data
     */
    constructor(layout: Layout, uuid: string, data: LayoutSectionData) {
        super();

        this.layout = layout;
        this.uuid = uuid;
        this.unavailable_service_placeholders = {};
        this._setData(data || {});
    }

    _setData(data: LayoutSectionData) {
        if (!data.accessories) data.accessories = [];

        this.data = Object.freeze(data);
        this.staged_data = undefined;

        this.emit('updated-data', data);
    }

    async updateData(data: LayoutSectionData) {
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

type LayoutSectionEvents = {
    'updated-data': (this: Layout, data: LayoutSectionData) => void;
};

interface LayoutSection {
    addListener<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    on<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    once<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    prependListener<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    prependOnceListener<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    removeListener<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    off<E extends keyof LayoutSectionEvents>(event: E, listener: LayoutSectionEvents[E]): this;
    removeAllListeners<E extends keyof LayoutSectionEvents>(event: E): this;
    listeners<E extends keyof LayoutSectionEvents>(event: E): LayoutSectionEvents[E][];
    rawListeners<E extends keyof LayoutSectionEvents>(event: E): LayoutSectionEvents[E][];

    emit<E extends keyof LayoutSectionEvents>(event: E, ...data: any[]): boolean;

    listenerCount<E extends keyof LayoutSectionEvents>(type: E): number;
}

export {LayoutSection};
