<template>
    <div class="service-wrapper" :data-accessory-uuid="service.accessory.uuid" :data-service-uuid="service.uuid" :data-service-type="service.type" @contextmenu.prevent="showDetails" @touchstart="touchstart" @touchend="touchend">
        <component v-if="component" ref="service" :is="component" :class="{'details-open': details_open}" :connection="connection" :service="service" @show-details="this.$emit('show-details', () => details_open = false); details_open = true" />

        <div v-else-if="service.is_system_service" class="service unsupported-service error">
            <h5>{{ service.name || service.accessory.name }}</h5>
            <p class="status">System service</p>
            <p v-if="service_name">{{ service_name }}</p>
        </div>

        <div v-else class="service unsupported-service" :class="{'details-open': details_open}">
            <h5>{{ service.name || service.accessory.name }}</h5>
            <p class="status">Not supported</p>
            <p v-if="service_name">{{ service_name }}</p>
        </div>
    </div>
</template>

<script>
    import {type_names} from '../service';
    import service_components from './services';

    export default {
        props: ['connection', 'service'],
        data() {
            return {
                details_open: false,
                touchstart_timeout: null,
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
