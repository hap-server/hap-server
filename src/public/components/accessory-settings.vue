<template>
    <panel ref="panel" class="accessory-settings" @close="$emit('close')">
        <p v-if="deleteBridge">{{ $t('accessory_settings.delete_bridge_info') }}</p>

        <panel-tabs v-if="!createBridge && !deleteBridge && (is_bridge || (config && !config.is_homebridge &&
            !config.type !== 'accessory-platform'))" v-model="tab" :tabs="tabs" />

        <form v-if="!createBridge && !deleteBridge && ((!is_bridge && !config) || tab === 'general')"
            @submit="save(true)"
        >
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">
                    {{ $t('accessory_settings.name') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :placeholder="accessory.default_name" :disabled="saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-room-name'">
                    {{ $t('accessory_settings.room') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-room-name'" v-model="room_name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>

            <template v-if="config && config.is_homebridge">
                <p>{{ $t('accessory_settings.configuration_unavailable_homebridge') }}</p>
            </template>

            <div v-if="config && config.type === 'accessory-platform'" class="d-flex mb-3">
                <p class="mb-0 flex-fill">{{ $t('accessory_settings.accessory_platform_configuration_info') }}</p>
                <a class="btn btn-default btn-sm ml-3" href="#" @click.prevent>
                    {{ $t('accessory_settings.accessory_platform_configuration') }}
                </a>
            </div>

            <h5 v-if="accessory.findService(s => !s.is_system_service && !s.collapse_to, true)">
                {{ $t('accessory_settings.services') }}
            </h5>
            <list-group class="mb-3">
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <list-item v-for="service in accessory.findServices(s => !s.is_system_service && !s.collapse_to, true)"
                    :key="service.uuid" @click="$emit('show-service-settings', service)"
                >
                    {{ service.name || service.uuid }}
                    <small v-if="service.name" class="text-muted">{{ service.uuid }}</small>
                    <p v-if="service.type_name" class="mb-0"><small>{{ service.type_name }}</small></p>
                </list-item>
            </list-group>

            <dl class="row">
                <template v-if="manufacturer">
                    <dt class="col-sm-4">{{ $t('accessory_settings.manufacturer') }}</dt>
                    <dd class="col-sm-8 text-right selectable">{{ manufacturer.value }}</dd>
                </template>

                <template v-if="model">
                    <dt class="col-sm-4">{{ $t('accessory_settings.model') }}</dt>
                    <dd class="col-sm-8 text-right selectable">{{ model.value }}</dd>
                </template>

                <template v-if="serial_number">
                    <dt class="col-sm-4">{{ $t('accessory_settings.serial_number') }}</dt>
                    <dd class="col-sm-8 text-right selectable">{{ serial_number.value }}</dd>
                </template>

                <template v-if="firmware_revision">
                    <dt class="col-sm-4">{{ $t('accessory_settings.firmware_revision') }}</dt>
                    <dd class="col-sm-8 text-right selectable">{{ firmware_revision.value }}</dd>
                </template>

                <template v-if="hardware_revision">
                    <dt class="col-sm-4">{{ $t('accessory_settings.hardware_revision') }}</dt>
                    <dd class="col-sm-8 text-right selectable">{{ hardware_revision.value }}</dd>
                </template>
            </dl>
        </form>

        <div v-if="tab === 'config' && config">
            <keep-alive>
                <accessory-configuration v-model="config" :accessory="accessory" :saving="saving_config"
                    @is-config-valid="valid => is_new_config_valid = valid" />
            </keep-alive>
        </div>

        <form v-if="!deleteBridge && (createBridge || tab === 'bridge_config') && bridge_config"
            @submit.prevent="saveBridgeConfig(true)"
        >
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-name'">
                    {{ $t('accessory_settings.name') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-name'" v-model="bridge_config.name" type="text"
                        class="form-control form-control-sm" :disabled="saving || !can_set_bridge_config" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-username'">
                    {{ $t('accessory_settings.username') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-username'" v-model="bridge_config.username" type="text"
                        class="form-control form-control-sm" pattern="^[0-9a-f]{2}:){5}[0-9a-f]$"
                        :placeholder="$t('accessory_settings.username_info')"
                        :disabled="saving || !can_set_bridge_config" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-pincode'">
                    {{ $t('accessory_settings.setup_code') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-pincode'" v-model="bridge_config.pincode" type="text"
                        class="form-control form-control-sm" pattern="^[0-9]{3}-[0-9]{2}-[0-9]{3}$"
                        placeholder="031-45-154" :disabled="saving || !can_set_bridge_config" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-port'">
                    {{ $t('accessory_settings.port') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-port'" v-model="bridge_config.port" type="number"
                        class="form-control form-control-sm" :placeholder="$t('accessory_settings.port_info')"
                        :disabled="saving || !can_set_bridge_config" />
                </div>
            </div>
        </form>

        <div v-if="!createBridge && !deleteBridge && tab === 'accessories'" class="list-group-group">
            <div v-if="bridge_config && can_set_bridge_config" class="list-group-group-item">
                <list-group>
                    <draggable class="draggable"
                        :list="bridge_config.accessories || $set(bridge_config, 'accessories', [])"
                        :group="_uid + '-accessories-draggable-group'"
                    >
                        <list-item v-for="[uuid, accessory] in bridge_config.accessories.map(uuid => [uuid, accessories[uuid]])"
                            :key="uuid" @click="$emit('show-accessory-settings', accessory)"
                        >
                            {{ accessory ? accessory.name : uuid }}
                            <small v-if="accessory" class="text-muted">{{ uuid }}</small>
                        </list-item>
                    </draggable>
                </list-group>
            </div>

            <div v-if="bridge_config && can_set_bridge_config" class="list-group-group-item">
                <h4>{{ $t('accessory_settings.other_accessories') }}</h4>

                <list-group>
                    <draggable class="draggable" :value="accessories_available_to_bridge"
                        :group="_uid + '-accessories-draggable-group'"
                    >
                        <list-item v-for="[uuid, accessory] in accessories_available_to_bridge.map(uuid => [uuid, accessories[uuid]])"
                            :key="uuid"
                        >
                            {{ accessory ? accessory.name : uuid }}
                            <small v-if="accessory" class="text-muted">{{ uuid }}</small>
                        </list-item>
                    </draggable>
                </list-group>
            </div>

            <div v-else class="list-group-group-item">
                <list-group>
                    <list-item v-for="accessory in bridged_accessories" :key="accessory.uuid"
                        @click="$emit('show-accessory-settings', accessory)"
                    >
                        {{ accessory.name }}
                        <small class="text-muted">{{ accessory.uuid }}</small>
                    </list-item>
                </list-group>
            </div>
        </div>

        <template v-if="!createBridge && !deleteBridge && tab === 'pairings'">
            <div v-if="pairing_details && !pairings.length">
                <p v-html="$t('accessory_settings.pair_setup_info', {pincode: pairing_details.pincode})" />

                <qr-code class="mb-3" :data="pairing_details.url" />

                <p>{{ $t('accessory_settings.setup_payload') }} <code>{{ pairing_details.url }}</code></p>
            </div>

            <p v-if="pairings.length">{{ $t('accessory_settings.pairings_info') }}</p>

            <list-group v-if="pairings.length" class="mb-3">
                <list-item v-for="[pairing, data, permissions] in pairings" :key="pairing.id"
                    @click="$emit('modal', {type: 'pairing-settings', pairing, data, permissions, accessory})"
                >
                    {{ data && data.name || pairing.id }}
                    <small v-if="data && data.name" class="text-muted">{{ pairing.id }}</small>
                    <small class="text-muted">{{ pairing.public_key }}</small>
                </list-item>
            </list-group>
        </template>

        <div class="d-flex">
            <div v-if="is_bridge && can_delete_bridge && !deleteBridge">
                <button class="btn btn-danger btn-sm" type="button"
                    @click="() => ($emit('close'), $emit('modal', {type: 'delete-bridge', accessory}))"
                >{{ $t('accessory_settings.delete') }}</button>&nbsp;
            </div>
            <div v-if="tab === 'pairings' && pairings.length">
                <button class="btn btn-warning btn-sm" type="button" :disabled="resetting_pairings"
                    @click="resetPairings">{{ $t('accessory_settings.reset_pairings') }}</button>
            </div>

            <div v-if="loading || loading_config || loading_bridge_config || loading_pairings">
                {{ $t('accessory_settings.loading') }}
            </div>
            <div v-else-if="saving">{{ $t('accessory_settings.saving') }}</div>
            <div class="flex-fill"></div>
            <button v-if="identify && !deleteBridge" class="btn btn-default btn-sm" type="button"
                :disabled="identify_saving" @click="setIdentify">{{ $t('accessory_settings.identify') }}</button>
            <template v-if="deleteBridge">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving || saving_bridge_config"
                    @click="() => $refs.panel.close()">{{ $t('accessory_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-danger btn-sm" type="button"
                    :disabled="saving || saving_bridge_config"
                    @click="save(true)">{{ $t('accessory_settings.save') }}</button>
            </template>
            <template v-else-if="createBridge || (tab === 'bridge_config' && bridge_config_changed) ||
                (config && can_set_bridge_config && tab === 'accessories' && accessories_changed)"
            >
                <button class="btn btn-default btn-sm" type="button"
                    :disabled="changed || saving || saving_bridge_config"
                    @click="() => $refs.panel.close()">{{ $t('accessory_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="loading || saving || saving_bridge_config || !can_set_bridge_config"
                    @click="saveBridgeConfig(!changed && !config_changed && !bridge_config_changed)"
                >{{ $t('accessory_settings.' + (createBridge ? 'create' : 'save')) }}</button>
            </template>
            <template v-else-if="(!is_bridge || tab === 'general') && changed">
                <button class="btn btn-default btn-sm" type="button"
                    :disabled="config_changed || bridge_config_changed || accessories_changed || saving ||
                        saving_bridge_config"
                    @click="() => $refs.panel.close()">{{ $t('accessory_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="loading || saving || saving_bridge_config"
                    @click="save(!config_changed && !bridge_config_changed && !accessories_changed)"
                >{{ $t('accessory_settings.save') }}</button>
            </template>
            <template v-else-if="tab === 'config' && config_changed">
                <button class="btn btn-default btn-sm" type="button"
                    :disabled="changed || saving || saving_config || saving_bridge_config"
                    @click="() => $refs.panel.close()">{{ $t('accessory_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="loading_config || saving_config || !can_set_config || !is_new_config_valid"
                    @click="saveConfig(!changed && !config_changed && !bridge_config_changed)"
                >{{ $t('accessory_settings.save') }}</button>
            </template>
            <template v-else>
                <button v-if="changed || config_changed || bridge_config_changed || accessories_changed" class="btn btn-default btn-sm"
                    type="button" :disabled="saving || saving_bridge_config"
                    @click="() => $refs.panel.close()">{{ $t('accessory_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="changed || config_changed || bridge_config_changed || accessories_changed || loading ||
                        saving || saving_bridge_config"
                    :title="loading || saving || saving_bridge_config ? null : changed || config_changed ||
                        bridge_config_changed || accessories_changed ?
                            $t('accessory_settings.unsaved_in_other_tab') : null"
                    @click="() => $refs.panel.close()">{{ $t('accessory_settings.done') }}</button>
            </template>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../client/connection';
    import Accessory from '../../client/accessory';
    import isEqual from 'lodash.isequal';

    import Panel from './panel.vue';
    import PanelTabs from './panel-tabs.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';
    import AccessoryConfiguration from './accessory-configuration.vue';

    export default {
        components: {
            Panel,
            PanelTabs,
            ListGroup,
            ListItem,
            AccessoryConfiguration,
            QrCode: () => import(/* webpackChunkName: 'qrcode' */ './qrcode.vue'),
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
        },
        props: {
            connection: Connection,
            accessory: Accessory,
            accessories: Object,
            bridgeUuids: {type: Array, default: () => []},

            createBridge: Boolean,
            deleteBridge: Boolean,
        },
        data() {
            return {
                loading_config: false,
                loading: false,
                loading_bridge_config: false,
                loading_pairings: false,
                loading_permissions: false,
                saving: false,
                saving_config: false,
                saving_bridge_config: false,
                resetting_pairings: false,

                tab: 'general',
                tabs: {
                    general: {label: () => this.$t('accessory_settings.general')},
                    config: {label: () => this.$t('accessory_settings.configuration'),
                        if: () => this.config && !this.config.is_homebridge &&
                            !this.config.type !== 'accessory-platform'},
                    bridge_config: {label: () => this.$t('accessory_settings.configuration'),
                        if: () => this.bridge_config},
                    accessories: {label: () => this.$t('accessory_settings.accessories'), if: () => this.is_bridge},
                    pairings: {label: () => this.$t('accessory_settings.pairings'), if: () => this.is_bridge},
                },

                config: null,
                saved_config: null,
                is_new_config_valid: false,

                bridge_config: null,
                saved_bridge_config: null,
                can_set_bridge_config: false,
                can_delete_bridge: false,

                name: null,
                room_name: null,

                is_bridge: false,
                accessory_uuids: [],
                pairings: [],
                pairing_details: null,

                identify_saving: false,
            };
        },
        computed: {
            changed() {
                if (!this.accessory) return false;

                return this.name !== this.accessory.data.name ||
                    this.room_name !== this.accessory.data.room_name;
            },
            config_changed() {
                if (!this.config || !this.saved_config) return false;

                return !isEqual(this.saved_config, this.config);
            },
            bridge_config_changed() {
                if (!this.bridge_config || !this.saved_bridge_config) return false;

                return this.bridge_config.name !== this.saved_bridge_config.name ||
                    this.bridge_config.username !== this.saved_bridge_config.username ||
                    this.bridge_config.pincode !== this.saved_bridge_config.pincode ||
                    this.bridge_config.port !== this.saved_bridge_config.port;
            },
            accessories_changed() {
                if (!this.bridge_config || !this.saved_bridge_config) return false;

                return JSON.stringify(this.bridge_config.accessories) !==
                    JSON.stringify(this.saved_bridge_config.accessories);
            },

            accessory_information() {
                if (!this.accessory) return;
                return this.accessory.getServiceByName('AccessoryInformation');
            },
            identify() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('Identify');
            },
            manufacturer() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('Manufacturer');
            },
            model() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('Model');
            },
            serial_number() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('SerialNumber');
            },
            firmware_revision() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('FirmwareRevision');
            },
            hardware_revision() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('HardwareRevision');
            },
            accessory_flags() {
                if (!this.accessory_information) return;
                return this.accessory_information.getCharacteristicByName('AccessoryFlags');
            },

            bridged_accessories() {
                return Object.values(this.accessories)
                    .filter(accessory => this.accessory_uuids.includes(accessory.uuid));
            },
            accessories_available_to_bridge() {
                return Object.keys(this.accessories)
                    .filter(uuid => !this.bridgeUuids.includes(uuid) && (!this.bridge_config ||
                        !this.bridge_config.accessories || !this.bridge_config.accessories.includes(uuid)));
            },
            close_with_escape_key() {
                if (this.deleteBridge) return !this.saving;
                if (this.createBridge || this.tab === 'bridge_config' || (this.bridge_config &&
                    this.can_set_bridge_config && this.tab === 'accessories')) return !this.saving;
                if (!this.is_bridge || this.tab === 'general') return !this.saving;
                return !this.loading && !this.saving;
            },
        },
        watch: {
            connection(connection, old_connection) {
                if (old_connection) {
                    old_connection.removeListener('update-pairings', this.handleUpdatePairings);
                    old_connection.removeListener('update-pairing-data', this.handleUpdatePairingData);
                }

                if (connection) {
                    connection.on('update-pairings', this.handleUpdatePairings);
                    connection.on('update-pairing-data', this.handleUpdatePairingData);
                }
            },
            saved_config(config) {
                this.config = JSON.parse(JSON.stringify(config));
            },
            saved_bridge_config(bridge_config) {
                this.bridge_config = JSON.parse(JSON.stringify(bridge_config));
            },
        },
        async created() {
            if (this.connection) {
                this.connection.on('update-pairings', this.handleUpdatePairings);
                this.connection.on('update-pairing-data', this.handleUpdatePairingData);
            }

            if (this.createBridge) {
                this.bridge_config = {};
                this.can_set_bridge_config = true;
            } else if (!this.deleteBridge) {
                this.name = this.accessory.configured_name;
                this.room_name = this.accessory.data.room_name;

                await Promise.all([
                    this.loadConfig(),

                    this.loadBridge(),
                    this.loadBridgeConfig(),
                    this.loadPairings(),
                    this.loadPermissions(),
                ]);
            }
        },
        destroyed() {
            if (this.connection) {
                this.connection.removeListener('update-pairings', this.handleUpdatePairings);
                this.connection.removeListener('update-pairing-data', this.handleUpdatePairingData);
            }
        },
        methods: {
            async loadConfig() {
                if (this.loading_config) throw new Error('Already loading configuration');
                this.loading_config = true;

                try {
                    this.saved_config = (await this.connection.getAccessoriesConfiguration(this.accessory.uuid))[0];
                } finally {
                    this.loading_config = false;
                }
            },
            async loadBridge() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    const bridge = (await this.connection.getBridges(this.accessory.uuid))[0];

                    this.is_bridge = !!bridge;
                    this.accessory_uuids = bridge ? bridge.accessory_uuids : [];
                } finally {
                    this.loading = false;
                }
            },
            async loadBridgeConfig() {
                if (this.loading_bridge_config) throw new Error('Already loading configuration');
                this.loading_bridge_config = true;

                try {
                    this.saved_bridge_config = (await this.connection.getBridgesConfiguration(this.accessory.uuid))[0];
                } finally {
                    this.loading_bridge_config = false;
                }
            },
            async loadPairings() {
                if (this.loading_pairings) throw new Error('Already loading pairings');
                this.loading_pairings = true;

                try {
                    const pairings = await this.connection.listPairings(this.accessory.uuid) || [];

                    if (pairings.length) {
                        this.pairings = await Promise.all([
                            this.connection.getPairings(...pairings
                                .map(pairing_id => ([this.accessory.uuid, pairing_id]))),
                            this.connection.getPairingsData(...pairings),
                            this.connection.getPairingsPermissions(...pairings),
                        ]).then(([details, data, permissions]) => pairings
                            .map((d, i) => [details[i], data[i], permissions[i]]));

                        this.pairing_details = null;
                    } else {
                        this.pairing_details = (await this.connection.getBridgesPairingDetails(this.accessory.uuid))[0];
                        this.pairings = [];
                    }
                } finally {
                    this.loading_pairings = false;
                }
            },
            async loadPermissions() {
                if (this.loading_permissions) throw new Error('Already loading permissions');
                this.loading_permissions = true;

                try {
                    const [permissions] = await this.connection.getBridgesConfigurationPermissions(this.accessory.uuid);

                    this.can_set_bridge_config = permissions.set && !permissions.is_from_config;
                    this.can_delete_bridge = permissions.delete && !permissions.is_from_config;
                } finally {
                    this.loading_permissions = false;
                }
            },
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    if (this.deleteBridge) {
                        await this.connection.deleteBridges(this.accessory.uuid);

                        this.$emit('remove', this.accessory);
                        this.$emit('close');

                        return;
                    }

                    const data = Object.assign({}, this.accessory.data, {
                        name: this.name,
                        room_name: this.room_name,
                    });

                    await this.accessory.updateData(data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            async saveConfig(close) {
                if (this.saving) throw new Error('Already saving configuration');
                this.saving = true;

                try {
                    if (!this.createBridge) {
                        await this.connection.setBridgeConfiguration(this.accessory.uuid, this.config);
                    } else {
                        const [uuid] = await this.connection.createBridges(this.config);

                        const [[details], [permissions]] = await Promise.all([
                            this.connection.getAccessories(uuid),
                            this.connection.getAccessoriesPermissions(uuid),
                        ]);

                        const accessory = new Accessory(this.connection, uuid, details, this.config, permissions);

                        this.$emit('accessory', accessory);
                    }

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            async saveBridgeConfig(close) {
                if (this.saving) throw new Error('Already saving configuration');
                this.saving = true;

                try {
                    if (!this.createBridge) {
                        await this.connection.setBridgeConfiguration(this.accessory.uuid, this.bridge_config);
                    } else {
                        const [uuid] = await this.connection.createBridges(this.bridge_config);

                        const [[details], [permissions]] = await Promise.all([
                            this.connection.getAccessories(uuid),
                            this.connection.getAccessoriesPermissions(uuid),
                        ]);

                        const accessory =
                            new Accessory(this.connection, uuid, details, this.bridge_config, permissions);

                        this.$emit('accessory', accessory);
                    }

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            async setIdentify() {
                if (this.identify_saving) throw new Error('Already setting Identify');
                this.identify_saving = true;

                try {
                    await this.identify.setValue(1);
                } finally {
                    this.identify_saving = false;
                }
            },
            async resetPairings() {
                if (this.resetting_pairings) throw new Error('Already resetting pairings');
                this.resetting_pairings = true;

                try {
                    await this.connection.resetBridgesPairings(this.accessory.uuid);

                    this.pairings = [];
                    this.pairing_details = (await this.connection.getBridgesPairingDetails(this.accessory.uuid))[0];
                } finally {
                    this.resetting_pairings = false;
                }
            },
            handleUpdatePairings(bridge_uuid /* , pairings */) {
                if (this.accessory.uuid !== bridge_uuid) return;

                this.loadPairings();
            },
            handleUpdatePairingData(pairing_id, data) {
                const pairing = this.pairings.find(([p]) => p.id === pairing_id);
                if (!pairing) return;

                pairing.splice(1, 1, data);
            },
        },
    };
</script>
