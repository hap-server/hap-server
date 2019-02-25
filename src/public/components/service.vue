<template>
    <div class="service-wrapper">
        <component v-if="component" :is="component" :connection="connection" :service="service" />

        <div v-else class="service unsupported-service">
            <h5>{{ service.accessory.name }}</h5>
            <h5>{{ service.name }}</h5>
            <p>Unsupported</p>
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
