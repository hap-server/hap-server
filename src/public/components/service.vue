<template>
    <div class="service-wrapper" :data-accessory-uuid="service.accessory.uuid" :data-service-uuid="service.uuid" :data-service-type="service.type" @contextmenu="$emit('show-settings')">
        <component v-if="component" :is="component" :connection="connection" :service="service" />

        <div v-else-if="service.is_system_service" class="service unsupported-service error">
            <h5>{{ service.accessory.name }}</h5>
            <h5>{{ service.name }}</h5>
            <p class="status">System service</p>
            <p v-if="service_name">{{ service_name }}</p>
        </div>

        <div v-else class="service unsupported-service">
            <h5>{{ service.accessory.name }}</h5>
            <h5>{{ service.name }}</h5>
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
        computed: {
            component() {
                return service_components.get(this.service.type);
            },
            service_name() {
                return type_names[this.service.type];
            }
        }
    };
</script>
