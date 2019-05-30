<template>
    <service class="service-bridge" :service="service" type="Bridge">
        <bridge-icon slot="icon" />
    </service>
</template>

<script>
    import Service from '../../../common/service';
    import ServiceComponent from './service.vue';
    import BridgeIcon from '../icons/hub.vue';

    // This isn't a real service
    export const uuid = '--bridge';

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
