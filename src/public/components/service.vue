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
            :service="service" type="System service" :error="true"
        >
            <p>System service</p>
        </service>

        <service v-else-if="service.is_unavailable" class="unavailable-accessory"
            :class="{'details-open': details_open}" :service="service" :type="service_name" :error="true"
        >
            <p>Not available</p>
        </service>

        <service v-else :key="service.accessory.uuid + '.' + service.uuid"
            class="unsupported-service" :class="{'details-open': details_open}"
            :service="service" :type="service_name" :error="true"
        >
            <p>Not supported</p>
        </service>
    </div>
</template>

<script>
    import Service, {type_names} from '../../client/service';

    import service_components from './services';
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
                return service_components.get(this.service.type);
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
