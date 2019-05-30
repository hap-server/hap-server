import EventEmitter from 'events';

import Connection from './connection';
import Accessory from './accessory';
import Layout from './layout';

export function $set(object, key, value) {
    if (require.cache[require.resolve('vue')]) {
        const {default: Vue} = require('vue');

        Vue.set(object, key, value);
    } else {
        object[key] = value;
    }
}

export function $delete(object, key) {
    if (require.cache[require.resolve('vue')]) {
        const {default: Vue} = require('vue');

        Vue.delete(object, key);
    } else {
        delete object[key];
    }
}

export default class Client extends EventEmitter {
    constructor(url, _WebSocket) {
        super();

        global.client = this;

        this.url = url || Connection.getDefaultURL();
        this.connection = null;
        this.connected = false;
        this.connect_error = null;
        this.WebSocket = _WebSocket;
        this.is_ws = !!_WebSocket;

        this.home_settings = null;
        this.accessories = null;
        this.layouts = null;
        this.automations = null;

        this.loading_home_settings = false;
        this.loading_accessories = false;
        this.loading_layouts = false;

        this._handleBroadcastMessage = this.handleBroadcastMessage.bind(this);
        this._handleDisconnected = this.handleDisconnected.bind(this);

        this.on('updated-accessories', (added, removed) => console.log('Updated accessories', added, removed));
        this.on('updated-layouts', (added, removed) => console.log('Updated layouts', added, removed));
    }

    /**
     * Connects to the server.
     *
     * @return {Promise<Connection>}
     */
    connect() {
        if (this.connection) return Promise.resolve(this.connection);
        if (this._connect) return this._connect;

        this.connect_error = null;

        return this._connect = Connection.connect(this.url, this.WebSocket).then(connection => {
            this.connection = connection;

            for (const accessory of Object.values(this.accessories || {})) {
                accessory.connection = connection;
            }
            for (const layout of Object.values(this.layouts || {})) {
                layout.connection = connection;
            }
            for (const automation of Object.values(this.automations || {})) {
                automation.connection = connection;
            }

            connection.on('received-broadcast', this._handleBroadcastMessage);
            connection.on('disconnected', this._handleDisconnected);

            this.emit('connected', connection);

            return connection;
        }).then(connection => {
            this.connected = true;
            this._connect = null;
            return connection;
        }, err => {
            this.connected = false;
            this.connect_error = err;
            this._connect = null;
            throw err;
        });
    }

    async tryConnect() {
        while (!this.connection) {
            console.log('Trying to connect');

            try {
                await this.connect();
                break;
            } catch (err) {
                console.error('Connect error', err);
            }

            await new Promise(r => setTimeout(r, 4000));
        }
    }

    /**
     * Disconnects from the server.
     *
     * @return {Promise}
     */
    async disconnect() {
        if (!this.connection) return;
        const connection = this.connection;
        this.connection = null;
        this.connected = false;

        const disconnect = this._disconnect = (this._disconnect || Promise.resolve()).then(() => {
            connection.removeListener('received-broadcast', this._handleBroadcastMessage);
            connection.removeListener('disconnected', this._handleDisconnected);

            connection.close();

            this.emit('disconnected');
        }).then(() => {
            if (this._disconnect === disconnect) this._disconnect = null;
        }, err => {
            if (this._disconnect === disconnect) this._disconnect = null;
            throw err;
        });

        return disconnect;
    }

    async handleBroadcastMessage(data) {
        if (this.home_settings && data.type === 'update-home-settings') {
            this.home_settings.name = data.name;
            this.home_settings.background_url = data.background_url;

            this.emit('update-home-settings', this.home_settings);
        }

        if (this.accessories && data.type === 'add-accessories') {
            const accessory_uuids = data.ids.filter(uuid => !this.accessories[uuid]);
            if (!accessory_uuids.length) return;

            const [[accessory_details], [accessory_data], [accessory_permissions]] = await Promise.all([
                this.connection.getAccessories(...accessory_uuid),
                this.connection.getAccessoriesData(...accessory_uuid),
                this.connection.getAccessoriesPermissions(...accessory_uuid),
            ]);

            const accessories = accessory_uuids.map((uuid, index) => new Accessory(this.connection, uuid,
                accessory_details[index], accessory_data[index], accessory_permissions[index]));

            for (const accessory of accessories) {
                $set(this.accessories, accessory.uuid, accessory);
                this.emit('new-accessory', accessory);
            }

            this.emit('new-accessories', accessories);
            this.emit('updated-accessories', accessories, []);
        }

        if (this.accessories && data.type === 'remove-accessories') {
            const accessory_uuids = data.ids.filter(uuid => this.accessories[uuid]);
            if (!accessory_uuids.length) return;

            const accessories = accessory_uuids.map(uuid => this.accessories[uuid]);

            for (const accessory of accessories) {
                $delete(this.accessories, accessory.uuid);
                this.emit('removed-accessory', accessory);
            }

            this.emit('removed-accessories', accessories);
            this.emit('updated-accessories', [], accessories);
        }

        if (this.accessories && data.type === 'update-accessory') {
            const accessory = this.accessories[data.uuid];
            accessory._setDetails(data.details);
        }

        if (this.accessories && data.type === 'update-accessory-data') {
            const accessory = this.accessory[data.uuid];
            accessory._setData(data.data);
        }

        if (this.accessories && data.type === 'update-characteristic') {
            const accessory = this.accessories[data.accessory_uuid];
            const service = accessory.findService(s => s.uuid === data.service_id);
            const characteristic = service.findCharacteristic(c => c.uuid === data.characteristic_id);

            characteristic._setDetails(data.details);
        }

        if (this.layouts && data.type === 'add-layout') {
            if (this.layouts[data.uuid]) return;

            const [[layout_data], [layout_permissions]] = await Promise.all([
                this.connection.getLayouts(data.uuid),
                this.connection.getLayoutsPermissions(data.uuid),
            ]);

            const layout = new Layout(this.connection, data.uuid, layout_data, layout_permissions);

            $set(this.layouts, layout.uuid, layout);
            this.emit('new-layout', layout);
            this.emit('new-layouts', [layout]);
            this.emit('updated-layouts', [layout], []);
        }

        if (this.layouts && data.type === 'remove-layout') {
            if (!this.layouts[data.uuid]) return;

            const layout = this.layouts[data.uuid];

            $delete(this.layouts, layout.uuid);
            this.emit('removed-layout', layout);
            this.emit('removed-layouts', [layout]);
            this.emit('updated-layouts', [], [layout]);
        }

        if (this.layouts && data.type === 'update-layout') {
            const layout = this.layouts[data.uuid];
            layout._setData(data.data);
        }

        if (this.layouts && data.type === 'add-layout-section') {
            const layout = this.layouts[data.layout_uuid];
            const [data] = await this.connection.getLayoutSection(data.layout_uuid, data.uuid);

            layout._handleNewLayoutSection(data.uuid, data);
        }

        if (this.layouts && data.type === 'remove-layout-section') {
            const layout = this.layouts[data.layout_uuid];

            layout._handleRemoveLayoutSection(data.uuid);
        }

        if (this.layouts && data.type === 'update-layout-section') {
            const layout = this.layouts[data.layout_uuid];
            const section = layout.sections[data.uuid];

            section._setData(data.data);
        }
    }

    handleDisconnected(event) {
        console.log('Disconnected');
        this.connection = null;
        this.connected = false;
        this.connect_error = event;

        this.emit('disconnected', event);
    }

    async refreshAccessories(dont_emit_events) {
        if (this.loading_accessories) throw new Error('Already loading accessories');
        this.loading_accessories = true;

        try {
            const accessory_uuids = await this.connection.listAccessories();

            const new_accessories = [];
            const removed_accessories = [];

            for (const accessory_uuid of accessory_uuids) {
                // Accessory already exists
                if (this.accessories[accessory_uuid]) continue;

                // Add this accessory to the list of accessories we don't yet know about
                new_accessories.push(accessory_uuid);
            }

            for (const accessory_uuid of Object.keys(this.accessories)) {
                // Accessory still exists
                if (accessory_uuids.includes(accessory_uuid)) continue;

                // Add this accessory to the list of accessories that have been removed
                removed_accessories.push(accessory_uuid);
            }

            const [new_accessory_details, new_accessory_data, new_accessory_permissions] = await Promise.all([
                this.connection.getAccessories(...new_accessories),
                this.connection.getAccessoriesData(...new_accessories),
                this.connection.getAccessoriesPermissions(...new_accessories),
            ]);

            const added_accessories = new_accessories.map((uuid, index) =>
                new Accessory(this.connection, uuid, new_accessory_details[index], new_accessory_data[index],
                    new_accessory_permissions[index])); // eslint-disable-line vue/script-indent

            for (const accessory of added_accessories) {
                $set(this.accessories, accessory.uuid, accessory);
                if (!dont_emit_events) this.emit('new-accessory', accessory);
            }

            if (added_accessories.length && !dont_emit_events) this.emit('new-accessories', added_accessories);

            const removed_accessory_objects = removed_accessories.map(uuid => this.accessories[uuid]);

            for (const accessory of removed_accessory_objects) {
                $delete(this.accessories, accessory.uuid);
                if (!dont_emit_events) this.emit('removed-accessory', accessory);
            }

            if (removed_accessories.length && !dont_emit_events) {
                this.emit('removed-accessories', removed_accessory_objects);
            }

            if (added_accessories.length || removed_accessories.length) {
                this.emit('updated-accessories', added_accessories, removed_accessory_objects);
            }
        } finally {
            this.loading_accessories = false;
        }
    }

    async refreshLayouts(dont_emit_events) {
        if (this.loading_layouts) throw new Error('Already loading layouts');
        this.loading_layouts = true;

        try {
            const layout_uuids = await this.connection.listLayouts();

            const new_layout_uuids = [];
            const removed_layout_uuids = [];

            for (const uuid of layout_uuids) {
                // Layout already exists
                if (this.layouts[uuid]) continue;

                // Add this layout to the list of layouts we don't yet know about
                new_layout_uuids.push(uuid);
            }

            for (const uuid of Object.keys(this.layouts)) {
                // Layout still exists
                if (layout_uuids.includes(uuid)) continue;

                // Add this layout to the list of layouts that have been removed
                removed_layout_uuids.push(uuid);
            }

            const [new_layouts_data, new_layouts_sections, new_layouts_permissions] = await Promise.all([
                this.connection.getLayouts(...new_layout_uuids),
                this.connection.listLayoutSections(...new_layout_uuids).then(section_uuids => {
                    const flat_section_uuids = section_uuids.map((section_uuids, index) => {
                        return section_uuids.map(section_uuid =>
                            [new_layout_uuids[index], section_uuid, index]);
                    }).flat();

                    return this.connection.getLayoutSections(...flat_section_uuids.map(([
                        layout_uuid, section_uuid, index,
                    ]) => [layout_uuid, section_uuid])).then(section_data => {
                        const all_layout_sections = {};

                        // eslint-disable-next-line guard-for-in
                        for (const index in section_data) {
                            const layout_uuid = flat_section_uuids[index][0];
                            const section_uuid = flat_section_uuids[index][1];
                            const data = section_data[index];

                            const layout_sections = all_layout_sections[layout_uuid] ||
                                (all_layout_sections[layout_uuid] = {});
                            layout_sections[section_uuid] = data;
                        }

                        return new_layout_uuids.map(uuid => all_layout_sections[uuid]);
                    });
                }),
                this.connection.getLayoutsPermissions(...new_layout_uuids),
            ]);

            const new_layouts = new_layout_uuids.map((uuid, index) => new Layout(this.connection, uuid,
                new_layouts_data[index], new_layouts_sections[index], new_layouts_permissions[index]));

            for (const layout of new_layouts) {
                $set(this.layouts, layout.uuid, layout);
                if (!dont_emit_events) this.emit('new-layout', layout);
            }

            if (new_layouts.length && !dont_emit_events) this.emit('new-layouts', new_layouts);

            const removed_layouts = removed_layout_uuids.map(uuid => this.layouts[uuid]);

            for (const layout of removed_layouts) {
                $delete(this.layouts, layout.uuid);
                if (!dont_emit_events) this.emit('removed-layout', layout);
            }

            if (removed_layouts.length && !dont_emit_events) this.emit('removed-layouts', removed_layouts);

            if (new_layouts.length || removed_layouts.length) {
                this.emit('updated-layouts', new_layouts, removed_layouts);
            }
        } finally {
            this.loading_layouts = false;
        }
    }
}
