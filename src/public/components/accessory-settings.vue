<template>
    <panel ref="panel" class="accessory-settings" @close="$emit('close')">
        <panel-tabs v-if="is_bridge" v-model="tab" :tabs="tabs" />

        <form v-if="!is_bridge || tab === 'general'" @submit="save(true)">
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

        <list-group v-if="tab === 'accessories'" class="mb-3">
            <list-item v-for="accessory in bridged_accessories" :key="accessory.uuid"
                @click="$emit('show-accessory-settings', accessory)"
            >
                {{ accessory.name }}
                <small class="text-muted">{{ accessory.uuid }}</small>
            </list-item>
        </list-group>

        <template v-if="tab === 'pairings'">
            <div v-if="pairing_details && !pairings.length">
                <p>Enter the code <code>{{ pairing_details.pincode }}</code> or scan this QR code to pair with this bridge:</p>

                <qr-code class="mb-3" :data="pairing_details.url" />

                <p>Setup payload: <code>{{ pairing_details.url }}</code></p>
            </div>

            <list-group class="mb-3">
                <list-item v-for="pairing in pairings" :key="pairing.id">
                    {{ pairing.id }}
                    <small class="text-muted">{{ pairing.public_key }}</small>
                </list-item>
            </list-group>
        </template>

        <div class="d-flex">
            <div v-if="tab === 'pairings' && pairings.length">
                <button class="btn btn-default btn-sm" type="button" :disabled="resetting_pairings"
                    @click="resetPairings">Reset pairings</button>
            </div>

            <div v-if="loading">Loading</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button v-if="identify" class="btn btn-default btn-sm" type="button" :disabled="identify_saving"
                @click="setIdentify">Identify</button>
            <template v-if="!is_bridge || tab === 'general'">
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
        },
        props: {
            connection: Connection,
            accessory: Accessory,
            accessories: Object,
        },
        data() {
            return {
                loading: false,
                loading_pairings: false,
                saving: false,
                resetting_pairings: false,

                tab: 'general',
                tabs: {
                    general: 'General',
                    accessories: 'Accessories',
                    pairings: 'Pairings',
                },

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
        },
        async created() {
            this.name = this.accessory.configured_name;
            this.room_name = this.accessory.data.room_name;

            await Promise.all([
                this.loadBridge(),
                this.loadPairings(),
            ]);
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
            async loadPairings() {
                if (this.loading_pairings) throw new Error('Already loading');
                this.loading_pairings = true;

                try {
                    const pairings = await this.connection.listPairings(this.accessory.uuid) || [];

                    if (pairings.length) {
                        this.pairings = await this.connection.getPairings(...pairings
                            .map(pairing_id => ([this.accessory.uuid, pairing_id])));
                        this.pairing_details = null;
                    } else {
                        this.pairing_details = (await this.connection.getBridgesPairingDetails(this.accessory.uuid))[0];
                        this.pairings = [];
                    }
                } finally {
                    this.loading_pairings = false;
                }
            },
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
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
                    const pairings = await this.connection.resetBridgesPairings(this.accessory.uuid);

                    this.pairings = [];
                    this.pairing_details = (await this.connection.getBridgesPairingDetails(this.accessory.uuid))[0];
                } finally {
                    this.resetting_pairings = false;
                }
            },
        },
    };
</script>
