<template>
    <panel ref="panel" class="add-accessory" @close="$emit('close')">
        <div v-if="discovered_accessory"></div>

        <template v-else>
            <h4 v-if="Object.keys(discovered_accessories).length">Discovered accessories</h4>
            <div v-if="Object.keys(discovered_accessories).length" class="discovered-accessories">
                <div v-for="discovered_accessory in discovered_accessories" :key="discovered_accessory.id"
                    class="discovered-accessory-wrapper"
                >
                    <component v-if="discovered_accessory.component" :is="discovered_accessory.component"
                        :discovered-accessory="discovered_accessory" />

                    <!-- <div v-else /> -->
                </div>
            </div>

            <!-- List accessory setup handlers that allow manual setup (without an accessory discovery handler) -->
        </template>

        <div class="d-flex">
            <div v-if="creating">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="creating" @click="() => $refs.panel.close()">Cancel</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import accessory_discovery_components from './accessory-discovery';

    import Panel from './panel.vue';

    export class DiscoveredAccessory {
        constructor(connection, plugin_name, accessory_discovery_id, id, data) {
            Object.defineProperty(this, 'connection', {configurable: true, value: connection});
            Object.defineProperty(this, 'plugin_name', {value: plugin_name});
            Object.defineProperty(this, 'accessory_discovery_id', {value: accessory_discovery_id});
            Object.defineProperty(this, 'id', {value: id});

            Object.assign(this, data);
        }

        get component() {
            return accessory_discovery_components.get(this.accessory_discovery_id);
        }
    }

    export default {
        components: {
            Panel,
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
            };
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
