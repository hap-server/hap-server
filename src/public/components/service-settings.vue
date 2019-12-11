<template>
    <panel ref="panel" @close="$emit('close')">
        <form @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">
                    {{ $t('service_settings.name') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :placeholder="service.default_name" :disabled="saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-room-name'">
                    {{ $t('service_settings.room') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-room-name'" v-model="room_name" type="text"
                        class="form-control form-control-sm" :placeholder="service.accessory.data.room_name"
                        :disabled="saving" />
                </div>
            </div>
        </form>

        <div class="d-flex">
            <div v-if="saving">{{ $t('service_settings.saving') }}</div>
            <div class="flex-fill"></div>
            <button v-if="!fromAccessorySettings" class="btn btn-default btn-sm" type="button"
                @click="$emit('show-accessory-settings')"
            >
                {{ $t('service_settings.accessory_settings') }}
            </button>&nbsp;
            <template v-if="changed || saving">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving"
                    @click="() => $refs.panel.close()">{{ $t('service_settings.cancel') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="saving"
                    @click="save(true)">{{ $t('service_settings.save') }}</button>
            </template>
            <button v-else key="primary" class="btn btn-primary btn-sm" type="button"
                @click="() => $refs.panel.close()">{{ $t('service_settings.done') }}</button>
        </div>

        <template v-if="accessory_settings_component">
            <component :is="accessory_settings_component" :service="service" />
        </template>
    </panel>
</template>

<script>
    import Connection from '../../client/connection';
    import Service from '../../client/service';
    import {ServiceSettingsComponents as accessory_settings_components} from '../component-registry';

    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            service: Service,
            fromAccessorySettings: Boolean,
        },
        data() {
            return {
                saving: false,

                name: null,
                room_name: null,
            };
        },
        computed: {
            changed() {
                if (!this.service) return false;

                return this.name !== this.service.data.name ||
                    this.room_name !== this.service.data.room_name;
            },
            accessory_settings_component() {
                return accessory_settings_components.get(this.service.type);
            },
            close_with_escape_key() {
                return !this.saving;
            },
        },
        watch: {
            'service.data.name'(name) {
                this.name = name;
            },
            'service.data.room_name'(room_name) {
                this.room_name = room_name;
            },
        },
        created() {
            // Register built in components
            require('./accessory-settings');

            this.name = this.service.configured_name;
            this.room_name = this.service.data.room_name;
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.service.data, {
                        name: this.name,
                        room_name: this.room_name,
                    });

                    const accessory_data = Object.assign({}, this.service.accessory.data, {
                        ['Service.' + this.service.uuid]: data,
                    });

                    if (!this.service.accessory.data.room_name) {
                        accessory_data.room_name = this.room_name;
                    }

                    await this.service.accessory.updateData(accessory_data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
