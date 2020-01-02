<template>
    <panel ref="panel" class="accessory-platform-settings" @close="$emit('close')">
        <template v-if="!accessory_platform_data">
            <p>Loading...</p>
        </template>

        <panel-tabs v-else v-model="tab" :tabs="tabs" />

        <template v-if="accessory_platform_data && tab === 'config'">
            <component :is="component" v-if="component" v-model="config" :accessory="accessory" :editable="can_set" />

            <template v-else>
                <codemirror v-model="current_value" class="mb-3" :options="options" @blur="blur" />
                <pre v-if="error" class="text-danger mt-2"><code>{{ error }}</code></pre>
            </template>
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
                :disabled="changed && !can_set" @click="() => changed ? save(true) : $refs.panel.close()"
            >
                {{ $t('accessory_settings.' + (changed ? 'save' : 'done')) }}
            </button>
        </div>
    </panel>
</template>

<script>
    import Client from '../../client/client';
    import {AccessoryPlatformConfigurationComponents} from '../component-registry';

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

            Codemirror: () => import(/* webpackChunkName: 'codemirror' */ 'codemirror/mode/javascript/javascript')
                .then(() => import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror')).then(c => c.codemirror),
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

                current_value: null,
                error: null,

                options: {
                    tabSize: 4,
                    mode: 'application/json',
                    theme: 'base16-dark',
                    lineNumbers: true,
                    line: true,
                },
            };
        },
        computed: {
            changed() {
                if (!this.accessory_platform_data || !this.accessory_platform_data.config) return false;
                return !isEqual(this.config, this.accessory_platform_data.config);
            },
            can_set() {
                return this.accessory_platform_data && this.accessory_platform_data.is_writable &&
                    this.accessory_platform_data.can_set;
            },
            can_delete() {
                return false;
            },
            component() {
                return this.accessory_platform_data ? AccessoryPlatformConfigurationComponents.get(JSON.stringify([
                    this.accessory_platform_data.plugin || null, this.accessory_platform_data.platform,
                ])) : null;
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
            config: {
                handler(value) {
                    this.current_value = JSON.stringify(value, null, 4) + '\n';
                    this.error = null;
                },
                deep: true,
            },
            current_value(current_value) {
                if (!this.can_set) {
                    this.current_value = JSON.stringify(JSON.parse(this.current_value), null, 4) + '\n';
                    this.error = new Error('This accessory platform\'s configuration cannot be updated or you ' +
                        'don\'t have permission to update it');
                    return;
                }

                try {
                    const new_value = JSON.parse(current_value);

                    if (new_value.plugin !== this.accessory_platform_data.config.plugin ||
                        new_value.platform !== this.accessory_platform_data.config.platform
                    ) {
                        throw new Error('Cannot change plugin/accessory platform');
                    }

                    this.config = new_value;
                    this.error = null;
                } catch (err) {
                    this.error = err;
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
            blur() {
                if (this.current_value.substr(-1) !== '\n') this.current_value += '\n';
            },
        },
    };
</script>

<style src="codemirror/lib/codemirror.css" />
<style src="codemirror/theme/base16-dark.css" />
