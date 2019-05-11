<template>
    <div class="root" :class="{scrolled}">
        <transition name="fade">
            <div :key="background_url" class="background"
                :style="{'background-image': background_url ? `url(${JSON.stringify(background_url)})` : 'none'}" />
        </transition>

        <div class="header">
            <div class="left">
            </div>

            <h1>
                <span class="d-inline d-sm-none">{{ show_automations ? 'Automations' : (layout ? authenticated_user && layout.uuid === 'Overview.' + authenticated_user.id ? name : layout.name : name) || 'Home' }}</span>
                <span class="d-none d-sm-inline">{{ name || 'Home' }}</span>
            </h1>

            <div class="right">
                <layout-selector v-model="layout" :layouts="layouts" :name="name"
                    :authenticated-user="authenticated_user" :can-create="can_create_layouts"
                    :can-update-home-settings="can_update_home_settings" :can-access-server-settings="can_access_server_settings"
                    :show-automations="show_automations" :can-access-automations="can_access_automations"
                    @edit-layout="$refs.layout.edit = !$refs.layout.edit" @show-automations="show_automations = $event"
                    @modal="modal => modals.push(modal)" />
            </div>
        </div>

        <keep-alive>
            <automations v-if="show_automations" ref="automations" :connection="connection" />
        </keep-alive>

        <div v-if="!show_automations" class="main">
            <layout ref="layout" :key="layout ? layout.uuid : ''" :layout="layout"
                :connection="connection" :accessories="accessories" :bridge-uuids="bridge_uuids"
                :title="(layout ? authenticated_user && layout.uuid === 'Overview.' + authenticated_user.id ? name : layout.name : name) || 'Home'" :sections="layout && layout.sections"
                :can-edit="layout && layout.can_set" :can-delete="layout && layout.can_delete" :show-all-accessories="!layout"
                @modal="modal => modals.push(modal)" @ping="ping" />
        </div>

        <template v-for="(modal, index) in modals">
            <authenticate v-if="modal.type === 'authenticate'" :key="index" :ref="'modal-' + index"
                :connection="connection" @close="modals.splice(index, 1)" />

            <settings v-else-if="modal.type === 'settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :loading-accessories="loading_accessories"
                :can-add-accessories="can_add_accessories" @modal="modal => modals.push(modal)"
                @show-accessory-settings="accessory => modals.push({type: 'accessory-settings', accessory})"
                @refresh-accessories="refreshAccessories()"
                @updated-settings="reload" @close="modals.splice(index, 1)" />
            <add-accessory v-else-if="modal.type === 'add-accessory'" :key="index" :ref="'modal-' + index"
                :connection="connection" @close="modals.splice(index, 1)" />

            <layout-settings v-else-if="modal.type === 'layout-settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :layout="modal.layout"
                @close="modals.splice(index, 1)" />
            <layout-settings v-else-if="modal.type === 'new-layout'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :create="true"
                @layout="l => (addLayout(layout = l), show_automations = false)"
                @close="modals.splice(index, 1)" />
            <layout-settings v-else-if="modal.type === 'delete-layout'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :layout="modal.layout" :delete-layout="true"
                @remove="removeLayout" @close="modals.splice(index, 1)" />

            <accessory-settings v-else-if="modal.type === 'accessory-settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessory="modal.accessory" :accessories="accessories"
                @show-accessory-settings="accessory => modals.push({type: 'accessory-settings', accessory})"
                @show-service-settings="service => modals.push({type: 'service-settings', service})"
                @close="modals.splice(index, 1)" />
            <service-settings v-else-if="modal.type === 'service-settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :service="modal.service"
                @show-accessory-settings="modals.push({type: 'accessory-settings', accessory: modal.service.accessory})"
                @close="modals.splice(index, 1)" />

            <accessory-details v-else-if="modal.type === 'accessory-details'" :key="index" :ref="'modal-' + index"
                :modal="modal" :service="modal.service"
                @show-settings="modals.push({type: 'service-settings', service: modal.service})"
                @show-accessory-settings="modals.push({type: 'accessory-settings', accessory: modal.service.accessory})"
                @close="modals.splice(index, 1)" />
        </template>

        <div v-if="!connection" class="connecting" :class="{reconnecting: has_connected}">
            <p>{{ has_connected ? 'Reconnecting' : 'Connecting' }}</p>
        </div>

        <template v-for="preload_url in preload_urls">
            <link :key="'1-' + preload_url" rel="preload" :href="preload_url" as="image" />
            <link :key="'2-' + preload_url" rel="prefetch" :href="preload_url" />
        </template>
    </div>
</template>

<script>
    import Connection, {AuthenticatedUser} from '../../common/connection';
    import Layout from '../layout';
    import Accessory from '../accessory';
    import {BridgeService, UnsupportedService} from '../service';
    import PluginManager from '../plugins';
    import {ConnectionSymbol, AccessoriesSymbol, GetAllDisplayServicesSymbol, GetServiceSymbol, PushModalSymbol}
        from '../internal-symbols';

    import Authenticate from './authenticate.vue';

    import LayoutComponent from './layout.vue';
    import LayoutSelector from './layout-selector.vue';
    import AccessoryDetails from './accessory-details.vue';

    export const instances = new Set();

    document.cookie = 'asset_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    export default {
        components: {
            Authenticate,

            Layout: LayoutComponent,
            LayoutSelector,
            AccessoryDetails,

            Automations: () => import(/* webpackChunkName: 'automations' */ '../automations/automations.vue'),

            Settings: () => import(/* webpackChunkName: 'settings' */ './settings.vue'),
            AddAccessory: () => import(/* webpackChunkName: 'settings' */ './add-accessory.vue'),
            LayoutSettings: () => import(/* webpackChunkName: 'settings' */ './layout-settings.vue'),
            AccessorySettings: () => import(/* webpackChunkName: 'settings' */ './accessory-settings.vue'),
            ServiceSettings: () => import(/* webpackChunkName: 'settings' */ './service-settings.vue'),
        },
        data() {
            return {
                connection: null,
                connecting: false,
                has_connected: false,
                loading: false,

                name: null,
                default_background_url: null,
                layouts: {},
                layout: null,

                show_automations: false,
                can_access_automations: false,

                can_update_home_settings: false,
                can_access_server_settings: false,
                can_add_accessories: false,
                can_create_layouts: false,
                loading_permissions: false,

                accessories: {},
                refresh_accessories_timeout: null,
                loading_accessories: false,

                bridge_uuids: [],
                loading_bridges: false,

                modals: [],
                scrolled: false,
            };
        },
        provide() {
            return {
                [ConnectionSymbol]: this.connection,
                [AccessoriesSymbol]: this.accessories,
                [GetAllDisplayServicesSymbol]: () => this.getAllServices(),
                [GetServiceSymbol]: (uuid, service_uuid) => this.getService(uuid, service_uuid),
                [PushModalSymbol]: modal => this.modals.push(modal),
            };
        },
        computed: {
            title() {
                if (this.modals.length) {
                    const modal = this.modals[this.modals.length - 1];

                    if (!modal.title) {
                        if (modal.type === 'authenticate') return 'Login';

                        if (modal.type === 'settings') return 'Settings';
                        if (modal.type === 'add-accessory') return 'Add accessory';

                        if (modal.type === 'layout-settings') return modal.layout.name + ' Settings';
                        if (modal.type === 'new-layout') return 'New layout';
                        if (modal.type === 'delete-layout') return 'Delete ' + modal.layout.name + '?';

                        if (modal.type === 'accessory-settings') return modal.accessory.name + ' Settings';
                        if (modal.type === 'service-settings') return (modal.service.name || modal.service.accessory.name) + ' Settings';

                        if (modal.type === 'accessory-details') return modal.service.name || modal.service.accessory.name;
                    }

                    return modal.title;
                }

                return this.name || 'Home';
            },
            background_url() {
                if (this.show_automations) return;

                if (this.layout && this.layout.background_url) return 'assets/' + this.layout.background_url;
                if (this.default_background_url) return 'assets/' + this.default_background_url;

                return require('../../../assets/default-wallpaper.jpg');
            },
            modal_open() {
                return this.connecting || !!this.modals.length ||
                    (this.show_automations && this.$refs.automations && this.$refs.automations.open_automation);
            },
            authenticated_user() {
                return this.connection ? this.connection.authenticated_user : undefined;
            },
            preload_urls() {
                const preload_urls = [require('../../../assets/default-wallpaper.jpg')];

                for (const layout of Object.values(this.layouts)) {
                    if (layout.background_url && !preload_urls.includes(layout.background_url)) {
                        preload_urls.push('assets/' + layout.background_url);
                    }
                }

                return preload_urls;
            },
        },
        watch: {
            title(title) {
                document.title = title;
            },
            modal_open() {
                document.body.style.overflow = this.modal_open ? 'hidden' : 'auto';
            },
            connection(connection, old_connection) {
                for (const accessory of Object.values(this.accessories)) {
                    accessory.connection = connection;
                }

                for (const layout of Object.values(this.layouts)) {
                    layout.connection = connection;
                }
            },
            async authenticated_user(authenticated_user) {
                document.cookie = 'asset_token=' + (authenticated_user ?
                    encodeURIComponent(authenticated_user.asset_token) : '; expires=Thu, 01 Jan 1970 00:00:00 GMT');

                if (!authenticated_user) return;

                await Promise.all([
                    this.reload(),
                    this.reloadPermissions(),
                    this.refreshLayouts(true),
                    this.reloadBridges(),
                    this.refreshAccessories(true),
                ]);
            },
            layout(layout) {
                // Save the current layout
                if (layout) localStorage.setItem('layout', layout.uuid);
                else localStorage.removeItem('layout');
            },
        },
        async created() {
            instances.add(this);

            window.addEventListener('scroll', this.onscroll);
            window.addEventListener('touchmove', this.onscroll);
            document.body.scrollTo(0, 0);

            this.$on('updated-accessories', (added, removed) => console.log('Updated accessories', added, removed));
            this.$on('updated-layouts', (added, removed) => console.log('Updated layouts', added, removed));

            await this.tryConnect();

            // await Promise.all([
            //     this.reload(),
            //     this.loadAccessoryUIs(),
            //     this.reloadBridges(),
            //     this.refreshAccessories(true),
            // ]);

            const refresh_accessories_function = async () => {
                await this.refreshAccessories();

                this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 600000);
            };
            this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 10000);
        },
        destroyed() {
            window.removeEventListener('scroll', this.onscroll);
            window.removeEventListener('touchmove', this.onscroll);

            this.connection.disconnect();

            instances.remove(this);
        },
        methods: {
            async connect() {
                if (this.connecting) throw new Error('Already trying to connect');
                this.connecting = true;

                try {
                    this.connection = await Connection.connect();

                    this.has_connected = true;
                    this.connectionEvents(this.connection);
                } finally {
                    this.connecting = false;
                }

                this.ping();
            },
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

                if (process.env.NODE_ENV === 'development') {
                    const development_data = await this.connection.send({type: 'development-data'});

                    if (development_data.vue_devtools_port) {
                        const devtools = require('@vue/devtools');
                        devtools.connect(development_data.vue_devtools_host, development_data.vue_devtools_port);
                    }
                }

                const loadAccessoryUIs = this.loadAccessoryUIs();

                await Promise.all([
                    loadAccessoryUIs,
                    this.tryRestoreSession().catch(() => {
                        loadAccessoryUIs.then(() => this.modals.push({type: 'authenticate'}));
                    }),
                ]);
            },
            async tryRestoreSession() {
                // Restore the previous session
                const token = localStorage.getItem('token');
                if (!token) throw new Error('No previous session');

                const response = await this.connection.send({
                    type: 'authenticate',
                    token,
                });

                if (response.reject || !response.success) throw new Error('Error restoring session');

                const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

                Object.defineProperty(authenticated_user, 'token', {value: token});
                Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
                Object.assign(authenticated_user, response.data);

                return this.connection.authenticated_user = authenticated_user;
            },
            async connectionEvents(connection) {
                connection.on('disconnected', event => {
                    if (!event.wasClean) console.error('Disconnected', event);
                    else console.log('Disconnected');

                    // The asset token is only valid while the WebSocket is connected
                    document.cookie = 'asset_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

                    this.connection = null;

                    return this.tryConnect();
                });

                connection.on('update-home-settings', data => {
                    this.name = data.name;
                    this.default_background_url = data.background_url;
                });

                connection.on('add-layout', async uuid => {
                    const [[layout_data], [layout_permissions]] = await Promise.all([
                        this.connection.getLayouts(uuid),
                        this.connection.getLayoutsPermissions(uuid),
                    ]);

                    const layout = new Layout(this.connection, uuid, layout_data, layout_permissions);

                    this.$set(this.layouts, layout.uuid, layout);
                    this.$emit('new-layout', layout);
                    this.$emit('new-layouts', [layout]);
                    this.$emit('updated-layouts', [layout], []);
                });

                connection.on('remove-layout', async uuid => {
                    const layout = this.layouts[uuid];

                    if (!layout) return;

                    this.$delete(this.layouts, layout.uuid);
                    this.$emit('removed-layout', layout);
                    this.$emit('removed-layouts', [layout]);
                    this.$emit('updated-layouts', [], [layout]);
                });

                connection.on('update-layout', (uuid, data) => {
                    const layout = this.layouts[uuid];

                    layout._setData(data);
                });

                connection.on('add-layout-section', async (layout_uuid, uuid) => {
                    const layout = this.layouts[layout_uuid];
                    const [data] = await this.connection.getLayoutSection(layout_uuid, uuid);

                    layout._handleNewLayoutSection(uuid, data);
                });

                connection.on('remove-layout-section', (layout_uuid, uuid) => {
                    const layout = this.layouts[layout_uuid];

                    layout._handleRemoveLayoutSection(uuid);
                });

                connection.on('update-layout-section', (layout_uuid, uuid, data) => {
                    const layout = this.layouts[layout_uuid];
                    const section = layout.sections[uuid];

                    section._setData(data);
                });

                connection.on('add-automation', () => {
                    this.can_access_automations = true;
                });

                connection.on('add-accessory', async accessory_uuid => {
                    if (this.accessories[accessory_uuid]) return;

                    const [[accessory_details], [accessory_data], [accessory_permissions]] = await Promise.all([
                        this.connection.getAccessories(accessory_uuid),
                        this.connection.getAccessoriesData(accessory_uuid),
                        this.connection.getAccessoriesPermissions(accessory_uuid),
                    ]);

                    const accessory = new Accessory(this.connection, accessory_uuid, accessory_details, accessory_data,
                        accessory_permissions); // eslint-disable-line vue/script-indent

                    this.$set(this.accessories, accessory.uuid, accessory);
                    this.$emit('new-accessory', accessory);
                    this.$emit('new-accessories', [accessory]);
                    this.$emit('updated-accessories', [accessory], []);
                });

                connection.on('remove-accessory', accessory_uuid => {
                    const accessory = this.accessories[uuid];

                    if (!accessory) return;

                    this.$delete(this.accessories, accessory.uuid);
                    this.$emit('removed-accessory', accessory);
                    this.$emit('removed-accessories', [accessory]);
                    this.$emit('updated-accessories', [], [accessory]);
                });

                connection.on('update-accessory', (uuid, details) => {
                    const accessory = this.accessories[uuid];

                    accessory._setDetails(details);
                });

                connection.on('update-accessory-data', (uuid, data) => {
                    const accessory = this.accessories[uuid];

                    accessory._setData(data);
                });

                connection.on('update-characteristic', (accessory_uuid, service_uuid, characteristic_uuid, details) => {
                    const accessory = this.accessories[accessory_uuid];
                    const service = accessory.findService(service => service.uuid === service_uuid);
                    const characteristic = service.findCharacteristic(c => c.uuid === characteristic_uuid);

                    characteristic._setDetails(details);
                });
            },
            async ping() {
                console.log('Sending ping request');
                const response = await this.connection.send('ping');
                console.log('Ping response', response);
            },
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    const data = await this.connection.getHomeSettings();

                    this.name = data.name || 'Home';
                    this.default_background_url = data.background_url;
                } finally {
                    this.loading = false;
                }
            },
            async reloadPermissions() {
                if (this.loading_permissions) throw new Error('Already loading permissions');
                this.loading_permissions = true;

                try {
                    const permissions = await this.connection.getHomePermissions();

                    this.can_update_home_settings = !!permissions.set;
                    this.can_access_server_settings = !!permissions.server;
                    this.can_add_accessories = !!permissions.add_accessories;
                    this.can_create_layouts = !!permissions.create_layouts;
                    this.can_access_automations = permissions.has_automations || permissions.create_automations;
                } finally {
                    this.loading_permissions = false;
                }
            },
            async loadAccessoryUIs() {
                if (this.loading_accessory_uis) throw new Error('Already loading accessory UIs');
                this.loading_accessory_uis = true;

                try {
                    const accessory_uis = await this.connection.getAccessoryUIs();

                    await Promise.all(accessory_uis.map(accessory_ui => PluginManager.loadAccessoryUI(accessory_ui)));
                } finally {
                    this.loading_accessory_uis = false;
                }
            },
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
                                return section_uuids.map(section_uuid => [new_layout_uuids[index], section_uuid, index]);
                            }).flat();

                            return this.connection.getLayoutSections(...flat_section_uuids.map(([layout_uuid, section_uuid, index]) => [layout_uuid, section_uuid])).then(section_data => {
                                const all_layout_sections = {};

                                // eslint-disable-next-line guard-for-in
                                for (const index in section_data) {
                                    const layout_uuid = flat_section_uuids[index][0];
                                    const section_uuid = flat_section_uuids[index][1];
                                    const data = section_data[index];

                                    const layout_sections = all_layout_sections[layout_uuid] || (all_layout_sections[layout_uuid] = {});
                                    layout_sections[section_uuid] = data;
                                }

                                return new_layout_uuids.map(uuid => all_layout_sections[uuid]);
                            });
                        }),
                        this.connection.getLayoutsPermissions(...new_layout_uuids),
                    ]);

                    const new_layouts = new_layout_uuids.map((uuid, index) => new Layout(this.connection, uuid,
                        new_layouts_data[index], new_layouts_sections[index], new_layouts_permissions[index])); // eslint-disable-line vue/script-indent

                    for (const layout of new_layouts) {
                        this.$set(this.layouts, layout.uuid, layout);
                        if (!dont_emit_events) this.$emit('new-layout', layout);
                    }

                    if (new_layouts.length && !dont_emit_events) this.$emit('new-layouts', new_layouts);

                    const removed_layouts = removed_layout_uuids.map(uuid => this.layouts[uuid]);

                    for (const layout of removed_layouts) {
                        this.$delete(this.layouts, layout.uuid);
                        if (!dont_emit_events) this.$emit('removed-layout', layout);
                    }

                    if (removed_layouts.length && !dont_emit_events) this.$emit('removed-layouts', removed_layouts);

                    if (new_layouts.length || removed_layouts.length) {
                        this.$emit('updated-layouts', new_layouts, removed_layouts);
                    }
                } finally {
                    this.loading_layouts = false;
                }

                const layout_uuid = localStorage.getItem('layout') || (this.authenticated_user ? 'Overview.' + this.authenticated_user.id : null);
                if (layout_uuid && this.layouts[layout_uuid] && !this.layout) this.layout = this.layouts[layout_uuid];
            },
            addLayout(layout) {
                this.$set(this.layouts, layout.uuid, layout);
                this.$emit('new-layout', layout);
                this.$emit('new-layouts', [layout]);
                this.$emit('updated-layouts', [layout], []);
            },
            removeLayout(layout) {
                if (this.layout === layout) this.layout = null;

                this.$delete(this.layouts, layout.uuid);
                this.$emit('remove-layout', layout);
                this.$emit('remove-layouts', [layout]);
                this.$emit('updated-layouts', [], [layout]);
            },
            async reloadBridges() {
                if (this.loading_bridges) throw new Error('Already loading bridges');
                this.loading_bridges = true;

                try {
                    this.bridge_uuids = await this.connection.listBridges(true);
                } finally {
                    this.loading_bridges = false;
                }
            },
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
                        this.$set(this.accessories, accessory.uuid, accessory);
                        if (!dont_emit_events) this.$emit('new-accessory', accessory);
                    }

                    if (added_accessories.length && !dont_emit_events) this.$emit('new-accessories', added_accessories);

                    const removed_accessory_objects = removed_accessories.map(uuid => this.accessories[uuid]);

                    for (const accessory of removed_accessory_objects) {
                        this.$delete(this.accessories, accessory.uuid);
                        if (!dont_emit_events) this.$emit('removed-accessory', accessory);
                    }

                    if (removed_accessories.length && !dont_emit_events) this.$emit('removed-accessories', removed_accessory_objects);

                    if (added_accessories.length || removed_accessories.length) {
                        this.$emit('updated-accessories', added_accessories, removed_accessory_objects);
                    }
                } finally {
                    this.loading_accessories = false;
                }
            },
            onscroll() {
                this.scrolled = document.body.scrollTop > 60;
            },
            findServices(callback) {
                const services = [];

                for (const accessory of this.accessories) {
                    services.push(...accessory.services.filter(callback));
                }

                return services;
            },
            getAllServices() {
                const services = [];

                for (const accessory of Object.values(this.accessories)) {
                    // Bridge tile
                    if (this.bridge_uuids.includes(accessory.uuid)) services.push(accessory.uuid + '.--bridge');

                    // Not supported tile
                    else if (!accessory.display_services.length) services.push(accessory.uuid + '.');

                    for (const service of accessory.display_services) services.push(accessory.uuid + '.' + service.uuid);
                }

                return services;
            },
            getService(uuid, service_uuid) {
                const accessory_uuid = uuid.split('.', 1)[0];
                if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);

                const accessory = this.accessories[accessory_uuid];
                if (!accessory) return;

                if (service_uuid === '--bridge') {
                    if (!this.bridge_uuids.includes(accessory.uuid)) return;

                    // {accessory, type: '--bridge'}
                    return BridgeService.for(accessory);
                }

                if (!service_uuid) {
                    // {accessory}
                    return UnsupportedService.for(accessory);
                }

                return accessory.display_services.find(s => s.uuid === service_uuid);
            },
        },
    };
</script>
