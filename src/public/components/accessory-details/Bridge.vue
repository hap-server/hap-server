<template>
    <accessory-details class="accessory-details-switch" :name="service.accessory.name" @show-settings="$emit('show-accessory-settings')">
        <p>Bridge</p>
    </accessory-details>
</template>

<script>
    import AccessoryDetails from './accessory-details.vue';

    // This isn't a real service
    export const uuid = '--bridge';

    export default {
        props: ['connection', 'service'],
        components: {
            AccessoryDetails,
        }
    };
</script>
