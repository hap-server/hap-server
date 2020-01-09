<template>
    <service class="service-bridge" :service="service" :type="$t('services.bridge.bridge')">
        <bridge-icon slot="icon" />
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import ServiceComponent from './service.vue';
    import BridgeIcon from '../icons/hub.vue';

    // This isn't a real service
    export const uuid = '--bridge';
    export const icon_component = BridgeIcon;

    export default {
        components: {
            Service: ServiceComponent,
            BridgeIcon,
        },
        props: {
            service: Service,
        },
    };
</script>
