<template>
    <div class="root" :class="{scrolled}">
        <div class="background" :style="{'background-image': `url(${JSON.stringify(background_url)})`}" />

        <div class="header">
            <div class="left">
                <span v-if="authenticated_user" class="badge badge-pill badge-dark clickable"
                    @click="modals.push({type: 'authenticate'})"
                >
                    Authenticated as {{ authenticated_user.name }}
                </span>
                <span v-else class="badge badge-pill badge-dark clickable" @click="modals.push({type: 'authenticate'})">
                    Login
                </span>

                <span class="badge badge-pill badge-dark clickable" @click="modals.push({type: 'settings'})">
                    Settings
                </span>
            </div>
            <h1>{{ name || 'Home' }}</h1>
            <div class="right">
            </div>
        </div>

        <div class="main">
            <h1>{{ name || 'Home' }}</h1>

            <layout :connection="connection" :accessories="accessories" :bridge-uuids="bridge_uuids"
                @modal="modal => modals.push(modal)" @ping="ping" />
        </div>

        <template v-for="(modal, index) in modals">
            <authenticate v-if="modal.type === 'authenticate'" :key="index" :ref="'modal-' + index"
                :connection="connection" @close="modals.splice(index, 1)" />

            <settings v-else-if="modal.type === 'settings'" :key="index" :ref="'modal-' + index"
                :connection="connection" :accessories="accessories" :loading-accessories="loading_accessories"
                @show-accessory-settings="accessory => modals.push({type: 'accessory-settings', accessory})"
                @refresh-accessories="refreshAccessories()"
                @updated-settings="reload" @close="modals.splice(index, 1)" />
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
    </div>
</template>

<script>
    import Connection, {AuthenticatedUser} from '../connection';
    import Accessory from '../accessory';
    import PluginManager from '../plugins';

    import Authenticate from './authenticate.vue';

    import Layout from './layout.vue';
    import AccessoryDetails from './accessory-details.vue';

    export const instances = new Set();

    export default {
        components: {
            Authenticate,

            Layout,
            AccessoryDetails,

            Settings: () => import(/* webpackChunkName: 'settings' */ './settings.vue'),
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

                accessories: {},
                refresh_accessories_timeout: null,
                loading_accessories: false,

                bridge_uuids: [],
                loading_bridges: false,

                modals: [],
                scrolled: false,
            };
        },
        computed: {
            title() {
                if (this.modals.length) {
                    const modal = this.modals[this.modals.length - 1];

                    if (!modal.title) {
                        if (modal.type === 'authenticate') return 'Login';

                        if (modal.type === 'settings') return 'Settings';
                        if (modal.type === 'accessory-settings') return modal.accessory.name + ' Settings';
                        if (modal.type === 'service-settings') return (modal.service.name || modal.service.accessory.name) + ' Settings';

                        if (modal.type === 'accessory-details') return modal.service.name || modal.service.accessory.name;
                    }

                    return modal.title;
                }

                return this.name || 'Home';
            },
            background_url() {
                return require('../../../assets/default-wallpaper.jpg');
            },
            modal_open() {
                return this.connecting || !!this.modals.length;
            },
            authenticated_user() {
                return this.connection ? this.connection.authenticated_user : undefined;
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
            },
            async authenticated_user(authenticated_user) {
                if (!authenticated_user) return;

                await Promise.all([
                    this.reload(),
                    this.reloadBridges(),
                    this.refreshAccessories(true),
                ]);
            },
        },
        async created() {
            instances.add(this);

            window.addEventListener('scroll', this.onscroll);
            window.addEventListener('touchmove', this.onscroll);
            document.body.scrollTo(0, 0);

            this.$on('updated-accessories', (added, removed) => console.log('Updated accessories', added, removed));

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

                const authenticated_user = new AuthenticatedUser(response.authentication_handler_id);

                Object.defineProperty(authenticated_user, 'token', {value: token});
                Object.assign(authenticated_user, response.data);

                return this.connection.authenticated_user = authenticated_user;
            },
            async connectionEvents(connection) {
                connection.on('disconnected', event => {
                    if (!event.wasClean) console.error('Disconnected', event);
                    else console.log('Disconnected');

                    this.connection = null;

                    return this.tryConnect();
                });

                connection.on('update-home-settings', data => {
                    this.name = data.name;
                });

                connection.on('add-accessory', async accessory_uuid => {
                    const [accessory_details, accessory_data] = await Promise.all([
                        this.connection.getAccessories(accessory_uuid),
                        this.connection.getAccessoriesData(accessory_uuid),
                    ]);

                    const accessory = new Accessory(this.connection, accessory_uuid, accessory_details, accessory_data);

                    this.$set(this.accessories, accessory.uuid, accessory);
                    this.$emit('new-accessory', accessory);
                    this.$emit('new-accessories', [accessory]);
                    this.$emit('updated-accessories', [accessory], []);
                });

                connection.on('remove-accessory', accessory_uuid => {
                    const accessory = this.accessories[uuid];

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
                } finally {
                    this.loading = false;
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

                    const [new_accessory_details, new_accessory_data] = await Promise.all([
                        this.connection.getAccessories(...new_accessories),
                        this.connection.getAccessoriesData(...new_accessories),
                    ]);

                    const added_accessories = new_accessories.map((uuid, index) =>
                        new Accessory(this.connection, uuid, new_accessory_details[index], new_accessory_data[index]));

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
        },
    };
</script>
