<template>
    <div class="root" :class="{scrolled}">
        <div class="header">
            <div class="left">
                <div class="badge badge-pill badge-dark" @click="show_settings = true">Settings</div>
            </div>
            <h1>{{ name || 'Home' }}</h1>
            <div class="right">
            </div>
        </div>

        <div class="main">
            <h1>{{ name || 'Home' }}</h1>

            <div class="section">
                <button class="btn btn-default btn-sm" @click="ping">Ping</button>
            </div>

            <!-- <h3>Fake accessories</h3>
            <div class="section mx-0">
                <service :connection="connection" :service="{name: 'Test 1', type: '00000049-0000-1000-8000-0026BB765291'}" />
            </div> -->

            <!-- <h3>Accessories</h3> -->
            <service-container v-for="accessory in Object.values(accessories)" :key="accessory.uuid" :title="accessory.name">
                <service v-for="service in accessory.services" :key="service.uuid" :connection="connection" :service="service" @show-settings="show_accessory_settings = service.accessory" />
            </service-container>
        </div>

        <settings v-if="show_settings" :connection="connection" @updated-settings="reload" @close="show_settings = false" />
        <accessory-settings v-if="show_accessory_settings" :connection="connection" :accessory="show_accessory_settings" @close="show_accessory_settings = null" />
        <!-- <service-settings v-if="show_service_settings" :connection="connection" :service="show_service_settings" /> -->
    </div>
</template>

<script>
    import Connection from '../connection';
    import Accessory from '../accessory';

    import Service from './service.vue';
    import ServiceContainer from './service-container.vue';

    import Settings from './settings.vue';
    import AccessorySettings from './accessory-settings.vue';

    export default {
        data() {
            return {
                connection: null,
                connecting: false,
                loading: false,

                name: null,

                show_settings: false,
                show_accessory_settings: null,
                // show_service_settings: null,

                accessories: {},
                refresh_accessories_timeout: null,
                loading_accessories: false,

                // title: 'Home',
                scrolled: false,
            };
        },
        components: {
            Service,
            ServiceContainer,

            Settings,
            AccessorySettings,
        },
        async created() {
            window.vroot = this;
            window.accessories = this.accessories;

            window.getAccessories = () => Object.values(this.accessories);

            window.addEventListener('scroll', this.onscroll);
            window.addEventListener('touchmove', this.onscroll);
            document.body.scrollTo(0, 0);

            this.$on('updated-accessories', (added, removed) => console.log('Updated accessories', added, removed));

            await this.connect();

            this.connection.on('update-home-settings', data => {
                this.name = data.name;
            });

            this.connection.on('add-accessory', async accessory_uuid => {
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

            this.connection.on('remove-accessory', accessory_uuid => {
                const accessory = this.accessories[uuid];

                this.$delete(this.accessories, accessory.uuid);
                this.$emit('removed-accessory', accessory);
                this.$emit('removed-accessories', [accessory]);
                this.$emit('updated-accessories', [], [accessory]);
            });

            this.connection.on('update-accessory', (uuid, details) => {
                const accessory = this.accessories[uuid];

                accessory._setDetails(details);
            });

            this.connection.on('update-accessory-data', (uuid, data) => {
                const accessory = this.accessories[uuid];

                accessory._setData(data);
            });

            this.connection.on('update-characteristic', (accessory_uuid, service_uuid, characteristic_uuid, details) => {
                const accessory = this.accessories[accessory_uuid];
                const service = accessory.findService(service => service.uuid === service_uuid);
                const characteristic = service.findCharacteristic(c => c.uuid === characteristic_uuid);

                characteristic._setDetails(details);
            });

            await Promise.all([
                this.reload(),
                this.refreshAccessories(true),
            ]);

            const refresh_accessories_function = async () => {
                await this.refreshAccessories();

                this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 600000);
            };
            // this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 600000);
        },
        methods: {
            async connect() {
                if (this.connecting) throw new Error('Already trying to connect');
                this.connecting = true;

                try {
                    this.connection = await Connection.connect();
                } finally {
                    this.connecting = false;
                }

                this.ping();
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
            async refreshAccessories(dont_emit_events) {
                if (this.loading_accessories) throw new Error('Already trying to connect');
                this.loading_accessories = true;

                try {
                    const accessory_uuids = await this.connection.listAccessories();

                    const new_accessories = [];
                    const removed_accessories = [];

                    for (let accessory_uuid of accessory_uuids) {
                        // Accessory already exists
                        if (this.accessories[accessory_uuid]) continue;

                        // Add this accessory to the list of accessories we don't yet know about
                        new_accessories.push(accessory_uuid);
                    }

                    for (let accessory_uuid of Object.keys(this.accessories)) {
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

                    for (let accessory of added_accessories) {
                        this.$set(this.accessories, accessory.uuid, accessory);
                        if (!dont_emit_events) this.$emit('new-accessory', accessory);
                    }

                    if (added_accessories.length && !dont_emit_events) this.$emit('new-accessories', added_accessories);

                    const removed_accessory_objects = removed_accessories.map(uuid => this.accessories[uuid]);

                    for (let accessory of removed_accessory_objects) {
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

                for (let accessory of this.accessories) {
                    services.push(...accessory.services.filter(callback));
                }

                return services;
            }
        },
        computed: {
            title() {
                if (this.show_service_settings) return this.show_service_settings.name + ' Settings';
                if (this.show_accessory_settings) return this.show_accessory_settings.name + ' Settings';
                if (this.show_settings) return 'Settings';

                return this.name || 'Home';
            },
            settings_open() {
                return this.show_service_settings || this.show_accessory_settings || this.show_settings;
            }
        },
        watch: {
            title(title) {
                document.title = title;
            },
            settings_open() {
                document.body.style.overflow = this.settings_open ? 'hidden' : 'auto';
            }
        }
    };
</script>
