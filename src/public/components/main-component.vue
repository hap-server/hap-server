<template>
    <div class="root" :class="{scrolled}">
        <div class="header">
            <div class="left">
                <div class="badge badge-pill badge-dark" @click="openHomeSettings">Settings</div>
            </div>
            <h1>{{ title }}</h1>
            <div class="right">
            </div>
        </div>

        <div class="main">
            <h1>{{ title }}</h1>

            <div class="section">
                <button @click="ping">Ping</button>
            </div>

            <h3>Fake accessories</h3>
            <div class="section mx-0">
                <service :connection="connection" :service="{name: 'Test 1', type: '00000049-0000-1000-8000-0026BB765291'}" />
            </div>

            <h3>Accessories</h3>
            <service-container v-for="accessory in Object.values(accessories)" :key="accessory.uuid" :title="accessory.name">
                <service v-for="service in accessory.services" :key="service.uuid" :connection="connection" :service="service" />
            </service-container>
        </div>
    </div>
</template>

<script>
    import Connection from '../connection';
    import Accessory from '../accessory';

    import Service from './service.vue';
    import ServiceContainer from './service-container.vue';

    export default {
        data() {
            return {
                connection: null,
                connecting: false,

                accessories: {},
                refresh_accessories_timeout: null,
                loading_accessories: false,

                title: 'Home',
                scrolled: false,
            };
        },
        components: {
            Service,
            ServiceContainer,
        },
        async created() {
            window.vroot = this;
            window.accessories = this.accessories;

            window.addEventListener('scroll', this.onscroll);
            window.addEventListener('touchmove', this.onscroll);
            document.body.scrollTo(0, 0);

            this.$on('updated-accessories', (added, removed) => console.log('Updated accessories', added, removed));

            await this.connect();

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
                const accessory = this.accessories.map(uuid => this.accessories[uuid]);

                this.$delete(this.accessories, accessory.uuid);
                this.$emit('removed-accessory', accessory);
                this.$emit('removed-accessories', [accessory]);
                this.$emit('updated-accessories', [], [accessory]);
            });

            await this.refreshAccessories(true);

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
            },
            openHomeSettings() {
                console.log('Opening home settings...');
            }
        },
        watch: {
            title(title) {
                document.title = title;
            }
        }
    };
</script>
