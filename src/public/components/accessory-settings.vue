<template>
    <panel ref="panel" class="accessory-settings" @close="$emit('close')">
        <p v-if="deleteBridge">Are you sure you want to delete this bridge?</p>

        <panel-tabs v-if="!createBridge && !deleteBridge && is_bridge" v-model="tab" :tabs="tabs" />

        <form v-if="!createBridge && !deleteBridge && (!is_bridge || tab === 'general')" @submit="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :placeholder="accessory.default_name" :disabled="saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-room-name'">Room</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-room-name'" v-model="room_name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>

            <h5 v-if="accessory.findService(service => !service.is_system_service)">Services</h5>
            <list-group class="mb-3">
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <list-item v-for="service in accessory.services" v-if="!service.is_system_service" :key="service.uuid"
                    @click="$emit('show-service-settings', service)"
                >
                    {{ service.name || service.uuid }}
                    <small v-if="service.name" class="text-muted">{{ service.type_name }} {{ service.uuid }}</small>
                </list-item>
            </list-group>

            <dl class="row">
                <template v-if="manufacturer">
                    <dt class="col-sm-4">Manufacturer</dt>
                    <dd class="col-sm-8 text-right selectable">{{ manufacturer.value }}</dd>
                </template>

                <template v-if="model">
                    <dt class="col-sm-4">Model</dt>
                    <dd class="col-sm-8 text-right selectable">{{ model.value }}</dd>
                </template>

                <template v-if="serial_number">
                    <dt class="col-sm-4">Serial Number</dt>
                    <dd class="col-sm-8 text-right selectable">{{ serial_number.value }}</dd>
                </template>

                <template v-if="firmware_revision">
                    <dt class="col-sm-4">Firmware</dt>
                    <dd class="col-sm-8 text-right selectable">{{ firmware_revision.value }}</dd>
                </template>

                <template v-if="hardware_revision">
                    <dt class="col-sm-4">Hardware Revision</dt>
                    <dd class="col-sm-8 text-right selectable">{{ hardware_revision.value }}</dd>
                </template>
            </dl>
        </form>

        <form v-if="!deleteBridge && (createBridge || tab === 'config') && config" @submit.prevent="saveConfig(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-name'" v-model="config.name" type="text"
                        class="form-control form-control-sm" :disabled="saving || !can_set_config" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-username'">Username</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-username'" v-model="config.username" type="text"
                        class="form-control form-control-sm" pattern="^[0-9a-f]{2}:){5}[0-9a-f]$"
                        placeholder="Leave blank to generate a username" :disabled="saving || !can_set_config" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-pincode'">Passcode</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-pincode'" v-model="config.pincode" type="text"
                        class="form-control form-control-sm" pattern="^[0-9]{3}-[0-9]{2}-[0-9]{3}$"
                        placeholder="031-45-154" :disabled="saving || !can_set_config" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-config-port'">Port</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-config-port'" v-model="config.port" type="number"
                        class="form-control form-control-sm" placeholder="Use a random port"
                        :disabled="saving || !can_set_config" />
                </div>
            </div>
        </form>

        <list-group v-if="!createBridge && !deleteBridge && tab === 'accessories'" class="mb-3">
            <template v-if="config && can_set_config">
                <draggable class="draggable" :list="config.accessories || $set(config, 'accessories', [])"
                    :group="_uid + '-accessories-draggable-group'"
                >
                    <list-item v-for="[uuid, accessory] in config.accessories.map(uuid => [uuid, accessories[uuid]])"
                        :key="uuid" @click="$emit('show-accessory-settings', accessory)"
                    >
                        {{ accessory ? accessory.name : uuid }}
                        <small v-if="accessory" class="text-muted">{{ uuid }}</small>
                    </list-item>
                </draggable>

                <list-item class="heading"><h4>Other accessories</h4></list-item>

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
            </template>

            <list-item v-else v-for="accessory in bridged_accessories" :key="accessory.uuid"
                @click="$emit('show-accessory-settings', accessory)"
            >
                {{ accessory.name }}
                <small class="text-muted">{{ accessory.uuid }}</small>
            </list-item>
        </list-group>

        <template v-if="!createBridge && !deleteBridge && tab === 'pairings'">
            <div v-if="pairing_details && !pairings.length">
                <p>Enter the code <code>{{ pairing_details.pincode }}</code> or scan this QR code to pair with this bridge:</p>

                <qr-code class="mb-3" :data="pairing_details.url" />

                <p>Setup payload: <code>{{ pairing_details.url }}</code></p>
            </div>

            <p v-if="pairings.length">Each Apple ID your home is shared with has it's own pairing. You can assign each pairing a name if you know which device/Apple ID it is for.</p>

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
            <div v-if="is_bridge && can_delete && !deleteBridge">
                <button class="btn btn-danger btn-sm" type="button"
                    @click="() => ($emit('close'), $emit('modal', {type: 'delete-bridge', accessory}))"
                >Delete</button>&nbsp;
            </div>
            <div v-if="tab === 'pairings' && pairings.length">
                <button class="btn btn-warning btn-sm" type="button" :disabled="resetting_pairings"
                    @click="resetPairings">Reset pairings</button>
            </div>

            <div v-if="loading || loading_config || loading_pairings">Loading</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button v-if="identify && !deleteBridge" class="btn btn-default btn-sm" type="button"
                :disabled="identify_saving" @click="setIdentify">Identify</button>
            <template v-if="deleteBridge">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-danger btn-sm" type="button" :disabled="saving"
                    @click="save(true)">Delete</button>
            </template>
            <template v-else-if="createBridge || tab === 'config' || (config && can_set_config && tab === 'accessories')">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="loading || saving || !can_set_config"
                    @click="saveConfig(true)">{{ createBridge ? 'Create' : 'Save' }}</button>
            </template>
            <template v-else-if="!is_bridge || tab === 'general'">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="loading || saving"
                    @click="save(true)">Save</button>
            </template>
            <button v-else key="primary" class="btn btn-primary btn-sm" type="button" :disabled="loading || saving"
                @click="() => $refs.panel.close()">Done</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import Accessory from '../accessory';

    import Panel from './panel.vue';
    import PanelTabs from './panel-tabs.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';

    export default {
        components: {
            Panel,
            PanelTabs,
            ListGroup,
            ListItem,
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
                loading: false,
                loading_config: false,
                loading_pairings: false,
                loading_permissions: false,
                saving: false,
                saving_config: false,
                resetting_pairings: false,

                tab: 'general',
                tabs: {
                    general: 'General',
                    config: {label: 'Configuration', if: () => this.config},
                    accessories: 'Accessories',
                    pairings: 'Pairings',
                },

                config: null,
                can_set_config: false,
                can_delete: false,

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
                    .filter(uuid => !this.bridgeUuids.includes(uuid) && (!this.config || !this.config.accessories ||
                        !this.config.accessories.includes(uuid)));
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
        },
        async created() {
            if (this.connection) {
                this.connection.on('update-pairings', this.handleUpdatePairings);
                this.connection.on('update-pairing-data', this.handleUpdatePairingData);
            }

            if (this.createBridge) {
                this.config = {};
                this.can_set_config = true;
            } else if (!this.deleteBridge) {
                this.name = this.accessory.configured_name;
                this.room_name = this.accessory.data.room_name;

                await Promise.all([
                    this.loadBridge(),
                    this.loadConfig(),
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
            async loadConfig() {
                if (this.loading_config) throw new Error('Already loading configuration');
                this.loading_config = true;

                try {
                    this.config = (await this.connection.getBridgesConfiguration(this.accessory.uuid))[0];
                } finally {
                    this.loading_config = false;
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

                    this.can_set_config = permissions.set && !permissions.is_from_config;
                    this.can_delete = permissions.delete && !permissions.is_from_config;
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
