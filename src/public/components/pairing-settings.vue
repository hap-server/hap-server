<template>
    <panel ref="panel" @close="$emit('close')">
        <form @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">
                    {{ $t('pairing_settings.name') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :disabled="saving || !can_set" />
                </div>
            </div>

            <dl class="row">
                <dt class="col-sm-4">{{ $t('pairing_settings.username') }}</dt>
                <dd class="col-sm-8 text-right selectable">{{ pairing.id }}</dd>

                <dt class="col-sm-4">{{ $t('pairing_settings.public_key') }}</dt>
                <dd class="col-sm-8 text-right selectable">{{ pairing.public_key }}</dd>
            </dl>
        </form>

        <div class="d-flex">
            <div v-if="saving">{{ $t('pairing_settings.saving') }}</div>
            <div class="flex-fill"></div>
            <template v-if="can_set && changed">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving"
                    @click="() => $refs.panel.close()">{{ $t('pairing_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="saving"
                    @click="save(true)">{{ $t('pairing_settings.save') }}</button>
            </template>
            <button v-else key="primary" class="btn btn-primary btn-sm" type="button"
                @click="() => $refs.panel.close()">{{ $t('pairing_settings.done') }}</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../client/connection';
    import Accessory from '../../client/accessory';

    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            accessory: Accessory,
            pairing: Object,
            pairingData: Object,
            permissions: Object,
        },
        data() {
            return {
                saving: false,

                name: null,
            };
        },
        computed: {
            changed() {
                if (!this.pairingData) return false;

                return this.name !== this.pairingData.name;
            },
            can_set() {
                return this.permissions.set;
            },
            close_with_escape_key() {
                return !this.can_set || !this.saving;
            },
        },
        created() {
            this.name = this.pairingData.name;
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.pairingData, {
                        name: this.name,
                    });

                    await this.connection.setPairingData(this.pairing.id, data);

                    this.pairingData.name = this.name;

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
