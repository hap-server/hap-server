<template>
    <accessory-details class="accessory-details-bridge" :name="service.accessory.name"
        @show-settings="$emit('show-accessory-settings')"
    >
        <bridge-icon slot="icon" />

        <p>{{ $t('services.bridge.bridge') }}</p>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import AccessoryDetails from './accessory-details.vue';
    import BridgeIcon from '../icons/hub.vue';

    // This isn't a real service
    export const uuid = '--bridge';

    export default {
        components: {
            AccessoryDetails,
            BridgeIcon,
        },
        props: {
            service: Service,
        },
    };
</script>
