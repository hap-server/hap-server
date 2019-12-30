<template>
    <panel ref="panel" class="accessory-platform-settings" @close="$emit('close')">
        <template v-if="!accessory_platform_data">
            <p>Loading...</p>
        </template>

        <panel-tabs v-else v-model="tab" :tabs="tabs" />

        <template v-if="accessory_platform_data && tab === 'config'">
            <pre><code>{{ JSON.stringify(config, null, 4) }}</code></pre>
        </template>

        <list-group v-if="accessory_platform_data && tab === 'accessories'" class="mb-3">
            <list-item
                v-for="[uuid, accessory] in accessory_platform_data.accessories.map(uuid => [uuid, client.accessories[uuid]])"
                :key="uuid" @click="$emit('show-accessory-settings', accessory)"
            >
                {{ accessory ? accessory.name : uuid }}
                <small v-if="accessory" class="text-muted">{{ uuid }}</small>
            </list-item>
        </list-group>

        <div class="d-flex">
            <div v-if="can_delete">
                <button class="btn btn-danger btn-sm" type="button"
                    @click="() => ($emit('close'), $emit('modal', {type: 'delete-accessory-platform', accessory}))"
                >{{ $t('accessory_settings.delete') }}</button>&nbsp;
            </div>

            <div v-if="loading">
                {{ $t('accessory_settings.loading') }}
            </div>
            <div class="flex-fill"></div>
            <button v-if="changed" key="cancel" class="btn btn-default btn-sm" type="button"
                @click="() => $refs.panel.close()"
            >
                {{ $t('accessory_settings.cancel') }}
            </button>
            <button :key="changed ? 'save' : 'done'" class="btn btn-primary btn-sm" type="button"
                @click="() => changed ? save(true) : $refs.panel.close()"
            >
                {{ $t('accessory_settings.' + (changed ? 'save' : 'done')) }}
            </button>
        </div>
    </panel>
</template>

<script>
    import Client from '../../client/client';

    import Panel from './panel.vue';
    import PanelTabs from './panel-tabs.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';

    import isEqual from 'lodash.isequal';

    export default {
        components: {
            Panel,
            PanelTabs,
            ListGroup,
            ListItem,
        },
        props: {
            client: Client,
            accessoryPlatformUuid: String,
        },
        data() {
            return {
                accessory_platform_data: null,
                config: null,
                loading: false,

                tab: 'config',
                tabs: {
                    config: {label: () => this.$t('accessory_settings.configuration')},
                    accessories: {label: () => this.$t('accessory_settings.accessories')},
                },
            };
        },
        computed: {
            changed() {
                if (!this.accessory_platform_data || !this.accessory_platform_data.config) return false;
                return !isEqual(this.config, this.accessory_platform_data.config);
            },
            can_delete() {
                return false;
            },
        },
        watch: {
            'client.connection'() {
                this.reload();
            },
            accessory_platform_data(data) {
                this.config = data ? JSON.parse(JSON.stringify(data.config)) : null;

                if (data) {
                    this.client.loadAccessories(this, data.accessories);
                } else {
                    this.client.unloadAccessories(this);
                }
            },
        },
        created() {
            this.reload();
        },
        destroyed() {
            this.client.unloadAccessories(this);
        },
        methods: {
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    [this.accessory_platform_data] =
                        await this.client.connection.getAccessoryPlatformsConfiguration(this.accessoryPlatformUuid);
                } finally {
                    this.loading = false;
                }
            },
            async save(close) {
                if (this.loading || this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    await this.client.connection.setAccessoryPlatformsConfiguration([
                        this.accessoryPlatformUuid, this.config,
                    ]);

                    if (close) this.$refs.panel.close();
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
