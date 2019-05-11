<template>
    <accessory-discovery class="service-bridge" :name="discoveredAccessory.name" type="HomeKit (HAP over IP)">
        <p>{{ discoveredAccessory.username }}</p>
    </accessory-discovery>
</template>

<script>
    import {DiscoveredAccessory} from '../add-accessory.vue';
    import AccessoryDiscovery from './accessory-discovery.vue';

    export const id = 0;

    export default {
        components: {
            AccessoryDiscovery,
        },
        props: {
            discoveredAccessory: DiscoveredAccessory,
        },
    };
</script>
