<template>
    <div :key="service.accessory.uuid + '.' + service.uuid"
        class="service-wrapper" :class="{'service-wrapper-editing': edit}"
        :data-accessory-uuid="service.accessory.uuid" :data-service-uuid="service.uuid"
        :data-service-type="service.type" @contextmenu.prevent="showDetails"
        @touchstart="touchstart" @touchend="touchend" @click="() => edit ? showSettings() : null"
    >
        <component v-if="component" :is="component" ref="service" :class="{'details-open': details_open}"
            :service="service"
            @show-details="this.$emit('show-details', () => details_open = false); details_open = true" />

        <service v-else-if="service.is_system_service" class="unsupported-service"
            :service="service" :type="$t('service_tile.system_service')"
        >
            <p>{{ $t('service_tile.system_service') }}</p>
        </service>

        <service v-else-if="service.is_unavailable" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name" :error="true"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.not_available') }}</p>
        </service>

        <service v-else-if="service.status === AccessoryStatus.WAITING" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.status_waiting') }}</p>
        </service>

        <service v-else-if="service.status === AccessoryStatus.DESTROYED" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.status_destroyed') }}</p>
        </service>

        <service v-else-if="service.status === AccessoryStatus.ERROR" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name" :error="true"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.status_error') }}</p>
        </service>

        <service v-else-if="service.status === AccessoryStatus.CONNECTING" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.status_connecting') }}</p>
        </service>

        <service v-else-if="service.status === AccessoryStatus.DISCONNECTING" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.status_disconnecting') }}</p>
        </service>

        <service v-else-if="service.status !== AccessoryStatus.READY" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name" :error="true"
        >
            <component :is="default_icon" v-if="default_icon" slot="icon" />
            <p>{{ $t('service_tile.status_unknown') }}</p>
        </service>

        <service v-else :key="service.accessory.uuid + '.' + service.uuid"
            class="unsupported-service" :class="{'details-open': details_open}"
            :service="service" :type="service_name"
        >
            <p>{{ $t('service_tile.not_supported') }}</p>
        </service>
    </div>
</template>

<script>
    import Service, {type_names} from '../../client/service';
    import {AccessoryStatus} from '../../common/types/accessories';

    import {ServiceTileComponents as service_components} from '../component-registry';
    import ServiceComponent from './services/service.vue';

    export default {
        components: {
            Service: ServiceComponent,
        },
        props: {
            service: Service,
            edit: Boolean,
        },
        data() {
            return {
                AccessoryStatus,

                details_open: false,
                touchstart_timeout: null,
            };
        },
        provide() {
            return {
                service: this.service,
            };
        },
        computed: {
            component() {
                const component_details = service_components.get(this.service.type);
                if (!component_details) return null;

                if (this.service.accessory.status !== AccessoryStatus.READY &&
                    !component_details.supported_statuses.includes(this.service.accessory.status)
                ) {
                    return null;
                }

                return component_details.component;
            },
            default_icon() {
                const component_details = service_components.get(this.service.type);
                if (!component_details) return null;

                return component_details.icon_component;
            },
            service_name() {
                return type_names[this.service.type];
            },
        },
        watch: {
            edit(edit) {
                if (edit && this.touchstart_timeout) clearTimeout(this.touchstart_timeout);
            },
        },
        created() {
            // Register built in components
            require('./services');
        },
        methods: {
            showDetails() {
                if (this.$refs.service && this.$refs.service.showDetails) {
                    this.$refs.service.showDetails();
                } else if (this.service.is_system_service) {
                    this.$emit('show-settings');
                } else {
                    this.$emit('show-details', () => this.details_open = false);
                    this.details_open = true;
                }
            },
            showSettings() {
                this.$emit('show-settings');
            },
            touchstart() {
                if (this.edit) return;

                if (this.touchstart_timeout) clearTimeout(this.touchstart_timeout);

                this.touchstart_timeout = setTimeout(() => {
                    this.touchstart_timeout = null;
                    this.showDetails();
                }, 500);
            },
            touchend() {
                if (this.touchstart_timeout) clearTimeout(this.touchstart_timeout);
            },
        },
    };
</script>
