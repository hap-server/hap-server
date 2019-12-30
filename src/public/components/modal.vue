<template>
    <div class="modal-window-container">
        <div v-if="error" class="modal-window-error">
            <pre class="selectable"><code>Error: {{ error.message }}</code><code>{{ error.stack.substr(error.stack.indexOf('\n')) }}</code></pre>

            <button class="btn btn-default btn-sm" @click="reload">{{ $t('modal.try_again') }}</button>
            <button class="btn btn-default btn-sm" @click="close">{{ $t('modal.cancel') }}</button>
        </div>
        <div v-else-if="!modal" class="modal-window-loading">
            <p>{{ $t('modal.loading') }}</p>

            <button class="btn btn-default btn-sm" @click="close">{{ $t('modal.cancel') }}</button>
        </div>

        <authenticate v-else-if="modal.type === 'authenticate'" :connection="client.connection" @close="close" />

        <settings v-else-if="modal.type === 'settings'" :connection="client.connection"
            :accessories="client.accessories" :loading-accessories="client.loading_accessories"
            :can-add-accessories="modal.canAddAccessories" :can-create-bridges="modal.canCreateBridges"
            :can-open-console="modal.canOpenConsole" :can-manage-users="modal.canManageUsers"
            :can-edit-user-permissions="modal.canManagePermissions"
            :can-access-server-info="modal.canAccessServerSettings" @modal="pushModal"
            @show-accessory-settings="accessory => pushModal({type: 'accessory-settings', accessory})"
            @refresh-accessories="client.refreshAccessories()" @updated-settings="updatedSettings" @close="close" />
        <add-accessory v-else-if="modal.type === 'add-accessory'" :connection="client.connection" @close="close" />

        <layout-settings v-else-if="modal.type === 'layout-settings'" :connection="client.connection"
            :accessories="client.accessories" :layout="modal.layout" @close="close" />
        <layout-settings v-else-if="modal.type === 'new-layout'" :connection="client.connection"
            :accessories="client.accessories" :create="true" @layout="addNewLayout" @close="close" />
        <layout-settings v-else-if="modal.type === 'delete-layout'" :connection="client.connection"
            :accessories="client.accessories" :layout="modal.layout" :delete-layout="true" @remove="removeLayout"
            @close="close" />

        <accessory-settings v-else-if="modal.type === 'accessory-settings'" :connection="client.connection"
            :accessory="modal.accessory" :accessories="client.accessories" :bridge-uuids="modal.bridge_uuids"
            @show-accessory-settings="accessory => pushModal({type: 'accessory-settings', accessory})"
            @show-service-settings="service => pushModal({type: 'service-settings', service})"
            @accessory-platform-settings="uuid => pushModal({type: 'accessory-platform-settings', uuid})"
            @modal="pushModal" @close="close" />
        <accessory-settings v-else-if="modal.type === 'new-bridge'" :connection="client.connection"
            :accessories="client.accessories" :bridge-uuids="bridgeUuids" :create-bridge="true"
            @accessory="addNewAccessory" @close="close" />
        <accessory-settings v-else-if="modal.type === 'delete-bridge'" :connection="client.connection"
            :accessory="modal.accessory" :accessories="client.accessories" :bridge-uuids="bridgeUuids"
            :delete-bridge="true" @remove="removeAccessory" @close="close" />

        <accessory-platform-settings v-else-if="modal.type === 'accessory-platform-settings'"
            :client="client" :accessory-platform-uuid="modal.uuid"
            @show-accessory-settings="accessory => pushModal({type: 'accessory-settings', accessory})" @close="close" />

        <pairing-settings v-else-if="modal.type === 'pairing-settings'" :connection="client.connection"
            :accessory="modal.accessory" :pairing="modal.pairing" :pairing-data="modal.pairing_data"
            :permissions="modal.permissions" @close="close" />

        <service-settings v-else-if="modal.type === 'service-settings'" :connection="client.connection"
            :service="modal.service" :from-accessory-settings="typeof modal.fromAccessorySettings === 'function' ?
                modal.fromAccessorySettings() : modal.fromAccessorySettings"
            @show-accessory-settings="pushModal({type: 'accessory-settings', accessory: modal.service.accessory})"
            @close="close" />

        <!-- <accessory-details v-else-if="modal.type === 'accessory-details'"
            :modal="modal" :service="modal.service"
            @show-settings="pushModal({type: 'service-settings', service: modal.service})"
            @show-accessory-settings="pushModal({type: 'accessory-settings', accessory: modal.service.accessory})"
            @close="close" /> -->

        <scene-settings v-else-if="modal.type === 'scene-settings'" :scene="modal.scene" @remove="removeScene"
            @close="close" />
        <scene-settings v-else-if="modal.type === 'create-scene'" :create="true" @created="addNewScene"
            @close="close" />

        <setup v-else-if="modal.type === 'setup'" :connection="client.connection" :query-token="setupToken"
            @close="close" />

        <div v-else>
            <p>{{ $t('modal.invalid_modal') }}</p>
        </div>

        <div v-if="!client.connection" class="connecting" :class="{reconnecting: has_connected}">
            <p>{{ has_connected ? 'Reconnecting' : 'Connecting' }}</p>
        </div>
    </div>
</template>

<script>
    import {AuthenticatedUser} from '../../client/connection';
    import PluginManager from '../plugins';
    import {NativeHookSymbol, ModalsSymbol, ClientSymbol, GetAssetURLSymbol} from '../internal-symbols';
    import {Modal} from '../modals';

    import Authenticate from './authenticate.vue';
    // import AccessoryDetails from './accessory-details.vue';

    export default {
        components: {
            Authenticate,

            // AccessoryDetails,

            SceneSettings: () => import(/* webpackChunkName: 'automations' */ '../automations/scene-settings.vue'),

            Settings: () => import(/* webpackChunkName: 'settings' */ './settings.vue'),
            AddAccessory: () => import(/* webpackChunkName: 'settings' */ './add-accessory.vue'),
            LayoutSettings: () => import(/* webpackChunkName: 'settings' */ './layout-settings.vue'),
            AccessorySettings: () => import(/* webpackChunkName: 'settings' */ './accessory-settings.vue'),
            AccessoryPlatformSettings: () =>
                import(/* webpackChunkName: 'settings' */ './accessory-platform-settings.vue'),
            PairingSettings: () => import(/* webpackChunkName: 'settings' */ './pairing-settings.vue'),
            ServiceSettings: () => import(/* webpackChunkName: 'settings' */ './service-settings.vue'),

            Setup: () => import(/* webpackChunkName: 'setup' */ './setup.vue'),
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

                has_connected: false,
                loading: false,
                loading_accessory_uis: false,
                error: null,
                modal: null,
            };
        },
        provide() {
            return {
                NoPanelFrame: true,
            };
        },
        watch: {
            async 'client.connection.authenticated_user'(authenticated_user) {
                if (!authenticated_user) return;

                await this.reload();
            },
        },
        created() {
            window.addEventListener('message', this.receiveMessage);

            this.client.on('connected', this.connected);
            this.client.on('disconnected', this.disconnected);

            this.client.tryConnect();
        },
        destroyed() {
            window.removeEventListener('message', this.receiveMessage);

            this.client.disconnect();

            this.client.unloadAccessories(this);
            this.client.unloadLayouts(this);
            this.client.unloadScenes(this);
        },
        methods: {
            async connected(connection) {
                this.has_connected = true;

                if (process.env.NODE_ENV === 'development') {
                    const development_data = await connection.send({type: 'development-data'});

                    if (development_data.vue_devtools_port) {
                        const devtools = require('@vue/devtools');
                        devtools.connect(development_data.vue_devtools_host, development_data.vue_devtools_port);
                    }
                }

                const loadAccessoryUIs = this.loadAccessoryUIs();

                await Promise.all([
                    loadAccessoryUIs,
                    this.tryRestoreSession(),
                ]);
            },
            disconnected() {
                this.connection = null;

                this.client.tryConnect();
            },
            async tryRestoreSession() {
                // Restore the previous session
                const token = localStorage.getItem('token');
                if (!token) throw new Error('No previous session');

                const response = await this.client.connection.send({
                    type: 'authenticate',
                    token,
                });

                if (response.reject || !response.success) throw new Error('Error restoring session');

                const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

                Object.defineProperty(authenticated_user, 'token', {value: token});
                Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
                Object.assign(authenticated_user, response.data);

                return this.client.connection.authenticated_user = authenticated_user;
            },
            async loadAccessoryUIs() {
                if (this.loading_accessory_uis) throw new Error('Already loading accessory UIs');
                this.loading_accessory_uis = true;

                try {
                    const accessory_uis = await this.client.connection.getAccessoryUIs();

                    await Promise.all(accessory_uis.map(accessory_ui => PluginManager.loadAccessoryUI(accessory_ui)));
                } finally {
                    this.loading_accessory_uis = false;
                }
            },

            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;
                this.error = null;

                try {
                    const modal = Modal.create(this.modals, this.$route.query.type);

                    if (modal.type === 'settings') {
                        await Promise.all([
                            this.client.loadAccessories(this),
                            this.client.connection.getHomePermissions().then(permissions => {
                                modal.canAccessServerSettings = !!permissions.server;
                                modal.canOpenConsole = !!permissions.console;
                                modal.canAddAccessories = !!permissions.add_accessories;
                                modal.canCreateBridges = !!permissions.create_bridges;
                                modal.canManageUsers = !!permissions.users;
                                modal.canManagePermissions = !!permissions.permissions;
                            }),
                        ]);
                    }

                    if (modal.type === 'layout-settings' || modal.type === 'delete-layout') {
                        await this.client.loadLayouts(this, [this.$route.query.layout]);
                        modal.layout = this.client.layouts[this.$route.query.layout];
                        if (!modal.layout) throw new Error('Unknown layout');
                    }

                    if (modal.type === 'accessory-settings' || modal.type === 'delete-bridge' ||
                        modal.type === 'pairing-settings'
                    ) {
                        modal.bridge_uuids = await this.client.connection.listBridges();
                        await this.client.loadAccessories(this, modal.bridge_uuids
                            .includes(this.$route.query.accessory) ? null : [this.$route.query.accessory]
                        );
                        modal.accessory = this.client.accessories[this.$route.query.accessory];
                        if (!modal.accessory) throw new Error('Unknown ' + (modal.bridge_uuids // eslint-disable-line curly
                            .includes(this.$route.query.accessory) ? 'bridge' : 'accessory'));
                    }

                    if (modal.type === 'accessory-platform-settings') {
                        modal.uuid = this.$route.query.uuid;
                    }

                    if (modal.type === 'pairing-settings') {
                        [[modal.pairing], [modal.pairing_data], [modal.permissions]] = await Promise.all([
                            this.client.connection.getPairings([modal.accessory.uuid, this.$route.query.pairing]),
                            this.client.connection.getPairingsData(this.$route.query.pairing),
                            this.client.connection.getPairingsPermissions(this.$route.query.pairing),
                        ]);
                        if (!modal.pairing) throw new Error('Unknown HAP pairing');
                    }

                    if (modal.type === 'service-settings') {
                        await this.client.loadAccessories(this, [this.$route.query.accessory]);
                        modal.accessory = this.client.accessories[this.$route.query.accessory];
                        if (!modal.accessory) throw new Error('Unknown accessory');
                        modal.service = modal.accessory.services[this.$route.query.service];
                        if (!modal.service) throw new Error('Unknown service');
                    }

                    if (modal.type === 'scene-settings') {
                        await this.client.loadScenes(this, [this.$route.query.scene]);
                        modal.scene = this.client.scene[this.$route.query.scene];
                        if (!modal.scene) throw new Error('Unknown scene');
                    }

                    this.modal = modal;
                } catch (err) {
                    console.error('Error loading modal resources', err);
                    this.error = err;
                } finally {
                    this.loading = false;

                    if (this.modals.__modal_loaded) this.modals.__modal_loaded();
                }
            },

            receiveMessage(event) {
                if (event.origin !== location.origin) return;
            },

            close() {
                window.close();
            },
            pushModal(modal) {
                this.modals.add(modal);
            },

            // None of these methods actually do anything at the moment
            // Nothing listens for these events - as the main window (and other modals) uses a separate connection
            // the server will send an update to them when anything happens
            updatedSettings() {
                this.$emit('updated-settings');
            },
            addNewLayout(layout) {
                this.$emit('new-layout', layout);
            },
            removeLayout(layout) {
                this.$emit('remove-layout', layout);
            },
            addNewAccessory(accessory) {
                this.$emit('new-accessory', accessory);
            },
            removeAccessory(accessory) {
                this.$emit('remove-accessory', accessory);
            },
            addNewScene(scene) {
                this.$emit('new-scene', scene);
            },
            removeScene(scene) {
                this.$emit('remove-scene', scene);
            },
        },
    };
</script>
