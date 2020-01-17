<template>
    <service class="service-camera" :service="service" :type="$t('services.camera.camera')">
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import ServiceComponent from './service.vue';

    export const uuid = 'CollapsedService.' + Service.CameraRTPStreamManagement;
    export default {
        components: {
            Service: ServiceComponent,
        },
        props: {
            service: Service,
        },
    };
</script>
