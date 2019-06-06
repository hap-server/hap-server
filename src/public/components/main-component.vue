<template>
    <div class="root" :class="{scrolled, 'has-open-modals': modal_open}">
        <transition name="fade">
            <div :key="background_url" class="background"
                :style="{'background-image': background_url ? `url(${JSON.stringify(background_url)})` : 'none'}" />
        </transition>

        <div class="header">
            <div class="left">
            </div>

            <h1>
                <span v-if="show_automations" class="d-inline d-sm-none">Automations</span>
                <span v-else-if="layout && !(authenticated_user && layout.uuid === 'Overview.' + authenticated_user.id)"
                    class="d-inline d-sm-none">{{ layout.name || 'Home' }}</span>
                <span v-else class="d-inline d-sm-none">{{ name || 'Home' }}</span>
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
            <automations v-if="show_automations" ref="automations" :connection="connection"
                @title="title => automations_title = title" />
        </keep-alive>

        <div v-if="!show_automations" class="main">
            <layout ref="layout" :key="layout ? layout.uuid : ''" :layout="layout"
                :title="(layout ? authenticated_user && layout.uuid === 'Overview.' + authenticated_user.id ? name : layout.name : name) || 'Home'"
                @modal="modal => modals.push(modal)" @ping="ping" />
        </div>

        <template v-for="(modal, index) in modals">
            <authenticate v-if="modal.type === 'authenticate'" :key="index" :ref="'modal-' + index"
                :connection="connection" @close="modals.splice(index, 1)" />

            <settings v-else-if="modal.type === 'settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :loading-accessories="loading_accessories"
                :can-add-accessories="can_add_accessories" :can-create-bridges="can_create_bridges"
                @modal="modal => modals.push(modal)"
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
                :bridge-uuids="bridge_uuids"
                @show-accessory-settings="accessory => modals.push({type: 'accessory-settings', accessory})"
                @show-service-settings="service => modals.push({type: 'service-settings', service})"
                @modal="modal => modals.push(modal)" @close="modals.splice(index, 1)" />
            <accessory-settings v-else-if="modal.type === 'new-bridge'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :bridge-uuids="bridge_uuids" :create-bridge="true"
                @accessory="addAccessory" @close="modals.splice(index, 1)" />
            <accessory-settings v-else-if="modal.type === 'delete-bridge'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessory="modal.accessory" :accessories="accessories"
                :bridge-uuids="bridge_uuids" :delete-bridge="true" @remove="removeAccessory"
                @close="modals.splice(index, 1)" />

            <pairing-settings v-else-if="modal.type === 'pairing-settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessory="modal.accessory" :pairing="modal.pairing"
                :pairing-data="modal.data" :permissions="modal.permissions" @close="modals.splice(index, 1)" />

            <service-settings v-else-if="modal.type === 'service-settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :service="modal.service"
                @show-accessory-settings="modals.push({type: 'accessory-settings', accessory: modal.service.accessory})"
                @close="modals.splice(index, 1)" />

            <accessory-details v-else-if="modal.type === 'accessory-details'" :key="index" :ref="'modal-' + index"
                :modal="modal" :service="modal.service"
                @show-settings="modals.push({type: 'service-settings', service: modal.service})"
                @show-accessory-settings="modals.push({type: 'accessory-settings', accessory: modal.service.accessory})"
                @close="modals.splice(index, 1)" />

            <scene-settings v-else-if="modal.type === 'scene-settings'" :key="index" :ref="'modal-' + index"
                :scene="modal.scene" @remove="removeScene" @close="modals.splice(index, 1)" />
            <scene-settings v-else-if="modal.type === 'create-scene'" :key="index" :ref="'modal-' + index"
                :create="true" @created="addScene" @close="modals.splice(index, 1)" />
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
    import {AuthenticatedUser} from '../../common/connection';
    import {BridgeService, UnsupportedService} from '../../common/service';
    import PluginManager from '../plugins';
    import {
        NativeHookSymbol, ClientSymbol, ConnectionSymbol, AccessoriesSymbol, BridgeUUIDsSymbol, LayoutsSymbol,
        ScenesSymbol, GetAllDisplayServicesSymbol, GetServiceSymbol, PushModalSymbol, GetAssetURLSymbol,
    } from '../internal-symbols';

    import Authenticate from './authenticate.vue';

    import LayoutComponent from './layout.vue';
    import LayoutSelector from './layout-selector.vue';
    import AccessoryDetails from './accessory-details.vue';

    export const instances = new Set();

    document.cookie = 'asset_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    export default {
        components: {
            Authenticate,

            Layout: LayoutComponent,
            LayoutSelector,
            AccessoryDetails,

            Automations: () => import(/* webpackChunkName: 'automations' */ '../automations/automations.vue'),
            SceneSettings: () => import(/* webpackChunkName: 'automations' */ '../automations/scene-settings.vue'),

            Settings: () => import(/* webpackChunkName: 'settings' */ './settings.vue'),
            AddAccessory: () => import(/* webpackChunkName: 'settings' */ './add-accessory.vue'),
            LayoutSettings: () => import(/* webpackChunkName: 'settings' */ './layout-settings.vue'),
            AccessorySettings: () => import(/* webpackChunkName: 'settings' */ './accessory-settings.vue'),
            PairingSettings: () => import(/* webpackChunkName: 'settings' */ './pairing-settings.vue'),
            ServiceSettings: () => import(/* webpackChunkName: 'settings' */ './service-settings.vue'),
        },
        inject: {
            _native_hook: {from: NativeHookSymbol},
            _client: {from: ClientSymbol},
            getAssetURL: {from: GetAssetURLSymbol},
        },
        data() {
            return {
                // Vue doesn't watch injected properties
                // This forces Vue to watch them
                native_hook: this._native_hook,
                client: this._client,

                connection: null,
                has_connected: false,
                loading: false,

                name: null,
                default_background_url: null,
                last_layout_uuid: null,
                force_update_layout: false,

                automations_title: null,
                can_access_automations: false,

                can_update_home_settings: false,
                can_access_server_settings: false,
                can_add_accessories: false,
                can_create_bridges: false,
                can_create_layouts: false,
                loading_permissions: false,

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
                [ConnectionSymbol]: () => this.connection,
                [AccessoriesSymbol]: this.accessories,
                [BridgeUUIDsSymbol]: this.bridge_uuids,
                [LayoutsSymbol]: this.layouts,
                [ScenesSymbol]: this.scenes,
                [GetAllDisplayServicesSymbol]: () => this.getAllServices(),
                [GetServiceSymbol]: (uuid, service_uuid) => this.getService(uuid, service_uuid),
                [PushModalSymbol]: modal => this.modals.push(modal),
            };
        },
        computed: {
            layout_uuid: {
                get() {
                    if (this.$route.name === 'user-default-layout' && this.authenticated_user) {
                        return 'Overview.' + this.authenticated_user.id;
                    } else if (this.$route.name === 'layout') {
                        return this.$route.params.layout_uuid;
                    }

                    return this.last_layout_uuid;
                },
                set(layout_uuid) {
                    if (layout_uuid && this.authenticated_user && layout_uuid === 'Overview.' + this.authenticated_user.id) {
                        this.$router.push({name: 'user-default-layout'});
                    } else if (layout_uuid) {
                        this.$router.push({name: 'layout', params: {layout_uuid: layout_uuid}});
                    } else {
                        this.$router.push({name: 'all-accessories'});
                    }

                    this.last_layout_uuid = layout_uuid;
                },
            },
            layout: {
                get() {
                    // Forces Vue to update this when the layout has loaded
                    this.force_update_layout;

                    return this.layouts[this.layout_uuid];
                },
                set(layout) {
                    this.layout_uuid = layout ? layout.uuid : null;
                },
            },
            show_automations: {
                get() {
                    return this.$route.name === 'automations';
                },
                set(show_automations) {
                    if (show_automations) this.$router.push({name: 'automations'});
                    else this.layout_uuid = this.last_layout_uuid;
                },
            },

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
                        if (modal.type === 'new-bridge') return 'New bridge';
                        if (modal.type === 'delete-bridge') return 'Delete ' + modal.accessory.name + '?';

                        if (modal.type === 'pairing-settings') {
                            return ((modal.data && modal.data.name) || modal.pairing.id) + ' Settings';
                        }

                        if (modal.type === 'service-settings') {
                            return (modal.service.name || modal.service.accessory.name) + ' Settings';
                        }

                        if (modal.type === 'accessory-details') {
                            return modal.service.name || modal.service.accessory.name;
                        }

                        if (modal.type === 'scene-settings') {
                            return (modal.scene.data.name || modal.scene.uuid) + ' Settings';
                        }
                        if (modal.type === 'new-scene') return 'New scene';
                    }

                    return modal.title;
                }

                if (this.show_automations) {
                    return this.automations_title || 'Automations';
                }

                return this.name || 'Home';
            },
            background_url() {
                if (this.show_automations) return;

                if (this.layout && this.layout.background_url) return this.getAssetURL(this.layout.background_url);
                if (this.default_background_url) return this.getAssetURL(this.default_background_url);

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
                        preload_urls.push(this.getAssetURL(layout.background_url));
                    }
                }

                return preload_urls;
            },

            connecting() {
                return this.client.connecting;
            },
            accessories() {
                return this.client.accessories || (this.client.accessories = {}); // eslint-disable-line vue/no-side-effects-in-computed-properties
            },
            layouts() {
                return this.client.layouts || (this.client.layouts = {}); // eslint-disable-line vue/no-side-effects-in-computed-properties
            },
            scenes() {
                return this.client.scenes || (this.client.scenes = {}); // eslint-disable-line vue/no-side-effects-in-computed-properties
            },
        },
        watch: {
            title(title) {
                document.title = title;
            },
            async authenticated_user(authenticated_user) {
                document.cookie = 'asset_token=' + (authenticated_user ?
                    encodeURIComponent(authenticated_user.asset_token) : '; expires=Thu, 01 Jan 1970 00:00:00 GMT') +
                    '; path=/';

                if (!authenticated_user) return;

                await Promise.all([
                    this.reload(),
                    this.reloadPermissions(),
                    this.refreshLayouts(),
                    this.reloadBridges(),
                    this.refreshAccessories(),
                    this.client.refreshScenes(),
                ]);

                // Force Vue to update the layout
                this.force_update_layout = !this.force_update_layout;
            },
            layout(layout) {
                // Only save the layout when using running as a web clip
                if (!navigator.standalone) return;

                // Save the current layout
                if (layout) localStorage.setItem('layout', layout.uuid);
                else localStorage.removeItem('layout');
            },
            layouts: {
                handler(layouts, old_layouts) {
                    const layout_uuid = localStorage.getItem('layout');
                    if (layout_uuid && this.layouts[layout_uuid] && !this.layout) this.layout_uuid = layout_uuid;

                    if (!navigator.standalone && layout_uuid) localStorage.removeItem('layout');

                    // Force Vue to update the layout
                    this.force_update_layout = !this.force_update_layout;
                },
                deep: true,
            },
        },
        async created() {
            instances.add(this);

            window.addEventListener('scroll', this.onscroll);
            window.addEventListener('touchmove', this.onscroll);
            document.scrollingElement.scrollTo(0, 0);

            this.client.on('connected', this.connected);
            this.client.on('disconnected', this.disconnected);
            this.client.on('update-home-settings', this.handleUpdateHomeSettings);
            // this.client.on('add-automation', this.handleAddAutomation);

            await this.client.tryConnect();

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
            clearTimeout(this.refresh_accessories_timeout);

            window.removeEventListener('scroll', this.onscroll);
            window.removeEventListener('touchmove', this.onscroll);

            this.client.disconnect();

            instances.delete(this);
        },
        methods: {
            async connected(connection) {
                this.connection = connection;
                this.has_connected = true;

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
                        return loadAccessoryUIs.then(() => this.modals.push({type: 'authenticate'}));
                    }),
                ]);
            },
            disconnected() {
                this.connection = null;

                // The asset token is only valid while the WebSocket is connected
                document.cookie = 'asset_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

                this.client.tryConnect();
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
            handleUpdateHomeSettings(data) {
                this.name = data.name;
                this.default_background_url = data.background_url;
            },
            handleAddAutomation() {
                this.can_access_automations = true;
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
                    this.can_create_bridges = !!permissions.create_bridges;
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
                await this.client.refreshLayouts(dont_emit_events);
            },
            addAccessory(accessory) {
                this.$set(this.accessories, accessory.uuid, accessory);
                this.$emit('new-accessory', accessory);
                this.$emit('new-accessories', [accessory]);
                this.$emit('update-accessories', [accessory], []);
            },
            removeAccessory(accessory) {
                this.$delete(this.accessories, accessory.uuid);
                this.$emit('removed-accessory', accessory);
                this.$emit('removed-accessories', [accessory]);
                this.$emit('update-accessories', [], [accessory]);
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
                this.$emit('removed-layout', layout);
                this.$emit('removed-layouts', [layout]);
                this.$emit('updated-layouts', [], [layout]);
            },
            addScene(scene) {
                this.$set(this.scenes, scene.uuid, scene);
                this.$emit('new-scene', scene);
                this.$emit('new-scenes', [scene]);
                this.$emit('updated-scenes', [scene], []);
            },
            removeScene(scene) {
                this.$delete(this.scenes, scene.uuid);
                this.$emit('removed-scene', scene);
                this.$emit('removed-scenes', [scene]);
                this.$emit('updated-scenes', [], [scene]);
            },
            async reloadBridges() {
                if (this.loading_bridges) throw new Error('Already loading bridges');
                this.loading_bridges = true;

                try {
                    const new_bridge_uuids = await this.connection.listBridges(true);
                    this.bridge_uuids.splice(0, this.bridge_uuids.length);
                    this.bridge_uuids.push(new_bridge_uuids);
                } finally {
                    this.loading_bridges = false;
                }
            },
            async refreshAccessories(dont_emit_events) {
                await this.client.refreshAccessories(dont_emit_events);
            },
            onscroll() {
                this.scrolled = document.scrollingElement.scrollTop > 60;
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

                    for (const service of accessory.display_services) {
                        services.push(accessory.uuid + '.' + service.uuid);
                    }
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
