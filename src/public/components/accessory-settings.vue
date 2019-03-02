<template>
    <panel ref="panel" @close="$emit('close')">
        <ul v-if="is_bridge" class="nav nav-tabs nav-sm mb-3">
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'general'}" href="#" @click.prevent="tab = 'general'">General</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'accessories'}" href="#" @click.prevent="tab = 'accessories'">Accessories</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'pairings'}" href="#" @click.prevent="tab = 'pairings'">Pairings</a></li>
        </ul>

        <div v-if="!is_bridge || tab === 'general'" class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
            <div class="col-sm-9">
                <input type="text" class="form-control form-control-sm" :id="_uid + '-name'" v-model="name" :placeholder="accessory.default_name" :disabled="saving" />
            </div>
        </div>

        <list-group v-if="!is_bridge || tab === 'general'">
            <list-item v-for="service in accessory.services" :key="service.uuid" @click="$emit('show-service-settings', service)">
                {{ service.name || service.uuid }}
                <small v-if="service.name" class="text-muted">{{ service.type_name }} {{ service.uuid }}</small>
            </list-item>
        </list-group>

        <list-group v-if="tab === 'accessories'" class="mb-3">
            <list-item v-for="accessory in accessories" v-if="accessory_uuids.includes(accessory.uuid)" :key="accessory.uuid" @click="$emit('show-accessory-settings', accessory)">
                {{ accessory.name }}
                <small class="text-muted">{{ accessory.uuid }}</small>
            </list-item>
        </list-group>

        <list-group v-if="tab === 'pairings'" class="mb-3">
            <list-item v-for="pairing in pairings" :key="pairing.id">
                {{ pairing.id }}
                <small class="text-muted">{{ pairing.public_key }}</small>
            </list-item>
        </list-group>

        <div class="d-flex">
            <div v-if="loading">Loading</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" @click="() => $refs.panel.close()" :disabled="saving">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button" @click="save(true)" :disabled="loading || saving">Save</button>
        </div>
    </panel>
</template>

<script>
    import Panel from './panel.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';

    export default {
        props: ['connection', 'accessory', 'accessories'],
        data() {
            return {
                loading: false,
                loading_pairings: false,
                saving: false,

                tab: 'general',

                name: null,

                is_bridge: false,
                accessory_uuids: [],
                pairings: [],
            };
        },
        components: {
            Panel,
            ListGroup,
            ListItem,
        },
        async created() {
            this.name = this.accessory.configured_name;

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
                    this.pairings = await this.connection.getPairings(...pairings.map(pairing_id => ([this.accessory.uuid, pairing_id])));
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
                    });

                    await this.accessory.updateData(data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            }
        }
    };
</script>
