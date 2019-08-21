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
                    :can-access-server-settings="can_access_server_settings || can_update_home_settings ||
                        can_open_console || can_add_accessories || can_create_bridges || can_create_layouts ||
                        can_manage_users"
                    :show-automations="show_automations" :can-access-automations="can_access_automations"
                    @edit-layout="$refs.layout.edit = !$refs.layout.edit" @show-automations="show_automations = $event"
                    @modal="modal => modals.add(modal)" />
            </div>
        </div>

        <keep-alive>
            <automations v-if="show_automations" ref="automations" :client="client"
                @title="title => automations_title = title" />
        </keep-alive>

        <div v-if="!show_automations" class="main">
            <layout ref="layout" :key="layout ? layout.uuid : ''" :layout="layout"
                :title="(layout ? authenticated_user && layout.uuid === 'Overview.' + authenticated_user.id ? name : layout.name : name) || 'Home'"
                @modal="modal => modals.add(modal)" @ping="ping" />
        </div>

        <component v-if="modals.component" :is="modals.component" ref="modals" :modals="modals" :client="client"
            :can-add-accessories="can_add_accessories" :can-create-bridges="can_create_bridges"
            :can-open-console="can_open_console" :can-manage-users="can_manage_users"
            :can-manage-permissions="can_manage_permissions" :can-access-server-settings="can_access_server_settings"
            :bridge-uuids="bridge_uuids" :setup-token="typeof should_open_setup === 'string' ? should_open_setup : ''"
            @updated-settings="reload" @new-layout="l => (addLayout(layout = l), show_automations = false)"
            @remove-layout="removeLayout" @new-accessory="addAccessory" @remove-accessory="removeAccessory"
            @new-scene="addScene" @remove-scene="removeScene" />

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
    import {AuthenticatedUser} from '../../client/connection';
    import {BridgeService, UnsupportedService} from '../../client/service';
    import PluginManager from '../plugins';
    import {
        NativeHookSymbol, ModalsSymbol, ClientSymbol, ConnectionSymbol,
        AccessoriesSymbol, BridgeUUIDsSymbol, LayoutsSymbol, ScenesSymbol,
        GetAllDisplayServicesSymbol, GetServiceSymbol, PushModalSymbol, GetAssetURLSymbol,
    } from '../internal-symbols';

    import LayoutComponent from './layout.vue';
    import LayoutSelector from './layout-selector.vue';

    export const instances = new Set();

    document.cookie = 'asset_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    export default {
        components: {
            Layout: LayoutComponent,
            LayoutSelector,

            Automations: () => import(/* webpackChunkName: 'automations' */ '../automations/automations.vue'),
        },
        inject: {
            _native_hook: {from: NativeHookSymbol},
            _modals: {from: ModalsSymbol},
            _client: {from: ClientSymbol},
            getAssetURL: {from: GetAssetURLSymbol},
        },
        data() {
            return {
                // Vue doesn't watch injected properties
                // This forces Vue to watch them
                native_hook: this._native_hook,
                modals: this._modals,
                client: this._client,

                connection: null,
                has_connected: false,
                loading: false,
                should_open_setup: false,

                name: null,
                default_background_url: null,
                last_layout_uuid: null,
                force_update_layout: false,

                automations_title: null,
                can_access_automations: false,

                can_update_home_settings: false,
                can_access_server_settings: false,
                can_open_console: false,
                can_add_accessories: false,
                can_create_bridges: false,
                can_create_layouts: false,
                can_manage_users: false,
                can_manage_permissions: false,
                loading_permissions: false,

                refresh_accessories_timeout: null,

                bridge_uuids: [],
                loading_bridges: false,

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
                [PushModalSymbol]: modal => this.modals.add(modal),
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
                if (this.modals.modal_open) {
                    return this.modals.stack[this.modals.stack.length - 1].title;
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
                return this.connecting || this.modals.modal_open ||
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
                    '; path=/' + (location.protocol === 'https:' ? '; Secure' : '');

                if (!authenticated_user) return;

                await Promise.all([
                    this.client.refreshLoaded(),
                    this.reload(),
                    this.reloadPermissions(),
                    this.reloadBridges(),
                ]);
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

            if (this.$route.name === 'setup') {
                this.should_open_setup = this.$route.query.token || true;
                this.$router.replace({name: 'user-default-layout'});
            }

            window.addEventListener('message', this.receiveMessage);
            window.addEventListener('keypress', this.onkeypress);
            window.addEventListener('scroll', this.onscroll);
            window.addEventListener('touchmove', this.onscroll);
            document.scrollingElement.scrollTo(0, 0);

            this.client.on('connected', this.connected);
            this.client.on('disconnected', this.disconnected);
            this.client.on('update-home-settings', this.handleUpdateHomeSettings);
            this.client.on('update-home-permissions', this.setPermissions);
            // this.client.on('add-automation', this.handleAddAutomation);
            this.client.on('updated-accessories', this.handleUpdatedAccessories);
            this.client.on('updated-layouts', this.handleUpdatedLayouts);

            // These won't load anything as the client hasn't authenticated (or even connected) yet
            // This is just to add this component as a dependency so they won't automatically be unloaded
            this.client.loadAccessories(this);
            this.client.loadLayouts(this);
            this.client.loadScenes(this);

            await this.client.tryConnect();

            // await Promise.all([
            //     this.reload(),
            //     this.loadAccessoryUIs(),
            //     this.reloadBridges(),
            //     this.refreshAccessories(true),
            // ]);

            const refresh_accessories_function = async () => {
                await this.client.refreshAccessories();

                this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 600000);
            };
            this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 10000);
        },
        destroyed() {
            clearTimeout(this.refresh_accessories_timeout);

            window.removeEventListener('message', this.receiveMessage);
            window.removeEventListener('keypress', this.onkeypress);
            window.removeEventListener('scroll', this.onscroll);
            window.removeEventListener('touchmove', this.onscroll);

            this.client.disconnect();

            this.client.unloadAccessories(this);
            this.client.unloadLayouts(this);
            this.client.unloadScenes(this);

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
                    this.should_open_setup ? loadAccessoryUIs.then(() => {
                        if (!this.modals.modal_open || this.modals.stack[this.modals.stack.length - 1].type !== 'setup') {
                            this.modals.add({type: 'setup'});
                        }
                    }) : this.tryRestoreSession().catch(() => loadAccessoryUIs.then(() => {
                        if (!this.modals.modal_open || this.modals.stack[this.modals.stack.length - 1].type !== 'authenticate') {
                            this.modals.add({type: 'authenticate'});
                        }
                    })),
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
            async receiveMessage(event) {
                if (event.origin !== location.origin) return;

                if (event.data && event.data.type === 'modal') {
                    const modal = event.data.modal;

                    if (modal.type === 'layout-settings' || modal.type === 'delete-layout') {
                        modal.layout = this.client.layouts[modal.layout];
                    }

                    if (modal.type === 'accessory-settings' || modal.type === 'delete-bridge' ||
                        modal.type === 'pairing-settings'
                    ) {
                        modal.accessory = this.client.accessories[modal.accessory];
                    }

                    if (modal.type === 'pairing-settings') {
                        [[modal.pairing], [modal.data], [modal.permissions]] = await Promise.all([
                            this.client.connection.getPairings([modal.accessory.uuid, modal.pairing]),
                            this.client.connection.getPairingsData(modal.pairing),
                            this.client.connection.getPairingsPermissions(modal.pairing),
                        ]);
                    }

                    if (modal.type === 'service-settings') {
                        modal.accessory = this.client.accessories[modal.accessory];
                        modal.service = modal.accessory.services[modal.service];
                    }

                    if (modal.type === 'scene-settings') {
                        modal.scene = this.client.scene[modal.scene];
                    }

                    this.modals.add(modal);
                }
            },
            handleUpdateHomeSettings(data) {
                this.name = data.name;
                this.default_background_url = data.background_url;
            },
            handleAddAutomation() {
                this.can_access_automations = true;
            },
            handleUpdatedAccessories() {
                // Force Vue to update the layout
                this.force_update_layout = !this.force_update_layout;
            },
            handleUpdatedLayouts() {
                // Force Vue to update the layout
                this.force_update_layout = !this.force_update_layout;
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
                    this.setPermissions(await this.connection.getHomePermissions());
                } finally {
                    this.loading_permissions = false;
                }
            },
            setPermissions(permissions) {
                this.can_update_home_settings = !!permissions.set;
                this.can_access_server_settings = !!permissions.server;
                this.can_open_console = !!permissions.console;
                this.can_add_accessories = !!permissions.add_accessories;
                this.can_create_bridges = !!permissions.create_bridges;
                this.can_create_layouts = !!permissions.create_layouts;
                this.can_access_automations = permissions.has_automations || permissions.create_automations;
                this.can_manage_users = !!permissions.users;
                this.can_manage_permissions = !!permissions.permissions;
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
                    this.bridge_uuids.splice(0, this.bridge_uuids.length, ...new_bridge_uuids);
                } finally {
                    this.loading_bridges = false;
                }
            },
            onscroll() {
                this.scrolled = document.scrollingElement.scrollTop > 60;
            },
            onkeypress(event) {
                if (event.key === 'Escape' && this.modals.modal_open && this.$refs.modals &&
                    this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)] &&
                    this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0] &&
                    this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].close_with_escape_key
                ) {
                    if (this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].$refs.panel) {
                        this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].$refs.panel.close(event);
                    } else {
                        this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].close(event);
                    }

                    event.preventDefault();
                }
            },
            findServices(callback) {
                const services = [];

                for (const accessory of this.accessories) {
                    services.push(...accessory.services.filter(callback));
                }

                return services;
            },
            getAllServices() {
                // Forces Vue to update this when the layout has loaded
                this.force_update_layout;

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
