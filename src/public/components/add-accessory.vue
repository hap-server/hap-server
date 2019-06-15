<template>
    <panel ref="panel" class="add-accessory" @close="$emit('close')">
        <div v-if="typeof accessory_setup_handler === 'number'">
            <component :is="accessory_setup_component" :connection="accessory_setup_connection" :creating="creating"
                @accessory="config => create('accessory', config, true)"
                @accessory-platform="config => create('platform', config, true)"
                @cancel="accessory_setup_handler = null" />
        </div>

        <div v-else-if="discovered_accessory">
            <component :is="discovered_accessory.setup_component" :connection="accessory_setup_connection"
                :discovered-accessory="discovered_accessory" :creating="creating"
                @accessory="config => create('accessory', config, true)"
                @accessory-platform="config => create('platform', config, true)"
                @cancel="discovered_accessory = null" />
        </div>

        <template v-else>
            <!-- TODO: maybe allow accessory platforms to list unconfigured accessories instead of adding new
                accessories to the accessory platform? -->

            <h4 v-if="Object.keys(discovered_accessories).length">Discovered accessories</h4>
            <div v-if="Object.keys(discovered_accessories).length" class="discovered-accessories">
                <div v-for="da in discovered_accessories" :key="da.id" class="discovered-accessory-wrapper">
                    <component v-if="da.component" :is="da.component" :discovered-accessory="da"
                        @click="() => discovered_accessory = da.setup_component ? da : null" />

                    <!-- <div v-else /> -->
                </div>
            </div>

            <!-- List accessory setup handlers that allow manual setup (without an accessory discovery handler) -->
            <h4 v-if="accessory_setup_handlers.length">Other</h4>
            <list-group v-if="accessory_setup_handlers.length" class="mb-3">
                <list-item v-for="[id, name] in accessory_setup_handlers" :key="id"
                    @click="accessory_setup_handler = id"
                >
                    {{ name }}
                </list-item>
            </list-group>
        </template>

        <div v-if="!(typeof accessory_setup_handler === 'number' && accessory_setup_component) && !(discovered_accessory && discovered_accessory.setup_component)" class="d-flex">
            <div v-if="creating">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="creating"
                @click="() => $refs.panel.close()">Cancel</button>
        </div>
    </panel>
</template>

<script>
    import Connection, {AccessorySetupConnection} from '../../client/connection';
    import accessory_discovery_components from './accessory-discovery';

    import Panel from './panel.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';
    import accessory_setup_components from './accessory-setup';

    export class DiscoveredAccessory {
        constructor(connection, plugin_name, accessory_discovery_id, id, data) {
            Object.defineProperty(this, 'connection', {configurable: true, value: connection});
            Object.defineProperty(this, 'plugin_name', {value: plugin_name});
            Object.defineProperty(this, 'accessory_discovery_id', {value: accessory_discovery_id});
            Object.defineProperty(this, 'id', {value: id});

            Object.assign(this, data);
        }

        get component() {
            const config = accessory_discovery_components.get(this.accessory_discovery_id);
            return config && config.component;
        }

        get setup_component() {
            const config = accessory_discovery_components.get(this.accessory_discovery_id);
            if (!config) return;

            const setup_config = accessory_setup_components.get(config.setup_handler);
            return setup_config && setup_config.component;
        }
    }

    export default {
        components: {
            Panel,
            ListGroup,
            ListItem,
        },
        props: {
            connection: Connection,
        },
        data() {
            return {
                loading_accessories: false,
                creating: false,

                discovered_accessories: {},
                discovered_accessory: null,
                accessory_setup_handler: null,
            };
        },
        computed: {
            accessory_setup_handlers() {
                return [...accessory_setup_components.entries()]
                    .filter(([id, {manual}]) => manual).map(([id, {name}]) => [id, name]);
            },
            accessory_setup_component() {
                const config = accessory_setup_components.get(this.accessory_setup_handler);
                return config && config.component;
            },
            accessory_setup_connection() {
                if (typeof this.accessory_setup_handler !== 'number' && !this.discovered_accessory) return null;

                return new AccessorySetupConnection(this.connection, typeof this.accessory_setup_handler === 'number' ?
                    this.accessory_setup_handler : this.discovered_accessory.accessory_discovery_id);
            },
        },
        watch: {
            connection(connection, old_connection) {
                if (old_connection) {
                    old_connection.removeListener('add-discovered-accessory', this.handleAddDiscoveredAccessory);
                    old_connection.removeListener('remove-discovered-accessory', this.handleRemoveDiscoveredAccessory);
                }

                if (connection) {
                    connection.on('add-discovered-accessory', this.handleAddDiscoveredAccessory);
                    connection.on('remove-discovered-accessory', this.handleRemoveDiscoveredAccessory);
                }
            },
        },
        created() {
            if (this.connection) {
                this.connection.on('add-discovered-accessory', this.handleAddDiscoveredAccessory);
                this.connection.on('remove-discovered-accessory', this.handleRemoveDiscoveredAccessory);
            }

            return this.startAccessoryDiscovery();
        },
        destroyed() {
            if (this.connection) {
                this.connection.removeListener('add-discovered-accessory', this.handleAddDiscoveredAccessory);
                this.connection.removeListener('remove-discovered-accessory', this.handleRemoveDiscoveredAccessory);
            }

            return this.stopAccessoryDiscovery();
        },
        methods: {
            async create(type, config, close) {
                if (this.creating) throw new Error('Already creating accessory');
                this.creating = true;

                try {
                    console.log('Creating', type === 'platform' ? 'accessory platform' : 'accessory', config);

                    // ...

                    if (close) this.$refs.panel.close();
                } finally {
                    this.creating = false;
                }
            },
            async startAccessoryDiscovery() {
                if (this.starting_accessory_discovery || this.stopping_accessory_discovery) {
                    throw new Error('Already starting/stopping accessory discovery');
                }
                this.starting_accessory_discovery = true;

                try {
                    // Start accessory discovery and get any already discovered accessories
                    const discovered_accessories = await this.connection.startAccessoryDiscovery();

                    for (const data of discovered_accessories) {
                        const discovered_accessory = new DiscoveredAccessory(this.connection, data.plugin,
                            data.accessory_discovery, data.id, data.data); // eslint-disable-line vue/script-indent

                        this.$set(this.discovered_accessories, discovered_accessory.id, discovered_accessory);
                    }
                } finally {
                    this.starting_accessory_discovery = false;
                }
            },
            async stopAccessoryDiscovery() {
                if (this.stopping_accessory_discovery) throw new Error('Already stopping accessory discovery');
                this.stopping_accessory_discovery = true;

                try {
                    await this.connection.stopAccessoryDiscovery();
                } finally {
                    this.stopping_accessory_discovery = false;
                }
            },
            handleAddDiscoveredAccessory(plugin_name, accessory_discovery_id, id, data) {
                const discovered_accessory = new DiscoveredAccessory(this.connection, plugin_name,
                    accessory_discovery_id, id, data); // eslint-disable-line vue/script-indent

                this.$set(this.discovered_accessories, discovered_accessory.id, discovered_accessory);
                this.discovered_accessories = this.discovered_accessories;
                this.$forceUpdate();
            },
            handleRemoveDiscoveredAccessory(plugin_name, accessory_discovery_id, id) {
                this.$delete(this.discovered_accessories, id);
                this.discovered_accessories = this.discovered_accessories;
                this.$forceUpdate();
            },
        },
    };
</script>
