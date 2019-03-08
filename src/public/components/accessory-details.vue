<template>
    <transition @after-leave="$emit('close')">
        <div v-if="show" class="accessory-details-wrapper" :data-accessory-uuid="service.accessory.uuid" :data-service-uuid="service.uuid" :data-service-type="service.type" @click="close">
            <component v-if="component" :is="component" ref="service" :connection="connection" :service="service" @show-settings="$emit('show-settings')" @show-accessory-settings="$emit('show-accessory-settings')" />

            <accessory-details v-else-if="service.is_system_service" class="unsupported-service error" :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')">
                <p slot="status" class="status">System service</p>
                <p v-if="service_name">{{ service_name }}</p>
            </accessory-details>

            <accessory-details v-else class="unsupported-service" :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')">
                <p slot="status" class="status">Not supported</p>
                <p v-if="service_name">{{ service_name }}</p>
            </accessory-details>
        </div>
    </transition>
</template>

<script>
    import {type_names} from '../service';
    import service_components from './accessory-details';
    import AccessoryDetails from './accessory-details/accessory-details.vue';

    export default {
        props: ['connection', 'service', 'modal'],
        data() {
            return {
                show: true,
            };
        },
        components: {
            AccessoryDetails,
        },
        computed: {
            component() {
                return service_components.get(this.service.type);
            },
            service_name() {
                return type_names[this.service.type];
            }
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
            }
        }
    };
</script>