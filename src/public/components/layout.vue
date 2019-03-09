<template>
    <div class="layout">
        <div class="section">
            <button class="btn btn-default btn-sm" @click="$emit('ping')">Ping</button>
        </div>

        <service-container title="Accessories">
            <template v-for="accessory in accessories">
                <!-- Show a bridge tile -->
                <service v-if="bridge_uuids.includes(accessory.uuid)" :key="accessory.uuid + '.--bridge'" :connection="connection" :service="{accessory, type: '--bridge'}" @show-details="closing => $emit('modal', {type: 'accessory-details', service: {accessory, type: '--bridge'}, closing})" />

                <!-- Show a not supported tile -->
                <service v-else-if="!accessory.display_services.length" :key="accessory.uuid + '.'" :connection="connection" :service="{accessory}" @show-details="closing => $emit('modal', {type: 'accessory-details', service: {accessory}, closing})" />

                <service v-for="service in accessory.display_services" :key="accessory.uuid + '.' + service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
            </template>
        </service-container>

        <!-- <h2>Display services</h2>

        <service-container v-for="accessory in accessories" v-if="accessory.display_services.length" :key="'1-' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.display_services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container>

        <h2>All services</h2>

        <service-container v-for="accessory in accessories" :key="'2' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container> -->

        <div class="section">
            <p>{{ Object.keys(accessories).length }} accessor{{ Object.keys(accessories).length === 1 ? 'y' : 'ies' }}</p>
        </div>
    </div>
</template>

<script>
    import Service from './service.vue';
    import ServiceContainer from './service-container.vue';

    export default {
        components: {
            Service,
            ServiceContainer,
        },
        props: ['connection', 'accessories', 'bridge_uuids']
    };
</script>
