<template>
    <div class="service-wrapper" :data-accessory-uuid="service.accessory.uuid" :data-service-uuid="service.uuid" :data-service-type="service.type" @contextmenu.prevent="showDetails" @touchstart="touchstart" @touchend="touchend">
        <component v-if="component" ref="service" :is="component" :class="{'details-open': details_open}" :service="service" @show-details="this.$emit('show-details', () => details_open = false); details_open = true" />

        <service v-else-if="service.is_system_service" class="unsupported-service error" :service="service" type="System service">
            <p>System service</p>
        </service>

        <service v-else class="unsupported-service" :class="{'details-open': details_open}" :service="service" :type="service_name">
            <p>Not supported</p>
        </service>
    </div>
</template>

<script>
    import {type_names} from '../service';
    import service_components from './services';
    import ServiceComponent from './services/service.vue';

    export default {
        components: {
            Service: ServiceComponent,
        },
        props: ['connection', 'service'],
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
            }
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
            touchstart() {
                if (this.touchstart_timeout) clearTimeout(this.touchstart_timeout);
                this.touchstart_timeout = setTimeout(() => {
                    this.touchstart_timeout = null;
                    this.showDetails();
                }, 500);
            },
            touchend() {
                if (this.touchstart_timeout) clearTimeout(this.touchstart_timeout);
            }
        }
    };
</script>
