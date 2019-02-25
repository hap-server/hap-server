<template>
    <div class="service-wrapper" :data-accessory-uuid="service.accessory && service.accessory.uuid" :data-service-uuid="service.uuid" @contextmenu="$emit('show-settings')">
        <component v-if="component" :is="component" :connection="connection" :service="service" />

        <div v-else class="service unsupported-service">
            <h5>{{ service.accessory && service.accessory.name }}</h5>
            <h5>{{ service.name }}</h5>
            <p>Not supported</p>
        </div>
    </div>
</template>

<script>
    import service_components from './services';

    export default {
        props: ['connection', 'service'],
        computed: {
            component() {
                return service_components.get(this.service.type);
            }
        }
    };
</script>
