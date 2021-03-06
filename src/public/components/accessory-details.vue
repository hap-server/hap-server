<template>
    <transition @after-leave="$emit('close')">
        <div v-if="show" class="accessory-details-wrapper" :data-accessory-uuid="service.accessory.uuid"
            :data-service-uuid="service.uuid" :data-service-type="service.type" @click="close"
        >
            <component v-if="component" :is="component" ref="service" :service="service"
                @show-settings="$emit('show-settings')" @show-accessory-settings="$emit('show-accessory-settings')" />

            <accessory-details v-else-if="service.is_system_service" class="unsupported-service error"
                :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
            >
                <p slot="status" class="status">{{ $t('service_details.system_service') }}</p>
                <p v-if="service_name">{{ service_name }}</p>
            </accessory-details>

            <accessory-details v-else-if="service.is_unavailable" class="unavailable-accessory"
                :name="service.name || service.accessory.name"
            >
                <p slot="status" class="status">{{ $t('service_details.not_available') }}</p>
                <p v-if="service_name">{{ service_name }}</p>
            </accessory-details>

            <accessory-details v-else class="unsupported-service" :name="service.name || service.accessory.name"
                @show-settings="$emit('show-accessory-settings')"
            >
                <p slot="status" class="status">{{ $t('service_details.not_supported') }}</p>
                <p v-if="service_name">{{ service_name }}</p>
            </accessory-details>
        </div>
    </transition>
</template>

<script>
    import Connection from '../../client/connection';
    import Service, {type_names} from '../../client/service';

    import {ServiceDetailsComponents as service_components} from '../component-registry';
    import AccessoryDetails from './accessory-details/accessory-details.vue';

    export default {
        components: {
            AccessoryDetails,
        },
        props: {
            connection: Connection,
            service: Service,
            modal: Object,
        },
        data() {
            return {
                show: true,
            };
        },
        provide() {
            return {
                service: this.service,
                closeAccessoryDetails: () => this.close(),
            };
        },
        computed: {
            component() {
                return service_components.get(this.service.type);
            },
            service_name() {
                return type_names[this.service.type];
            },
            close_with_escape_key() {
                return true;
            },
        },
        created() {
            // Register built in components
            require('./accessory-details');

            this.modal.instance = this;
        },
        mounted() {
            this.show = true;
        },
        methods: {
            close() {
                this.show = false;

                if (this.modal && this.modal.closing) {
                    this.modal.closing();
                }
            },
        },
    };
</script>
