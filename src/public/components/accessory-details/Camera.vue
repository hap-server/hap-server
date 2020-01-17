<template>
    <accessory-details class="accessory-details-camera"
        :name="service.name || service.accessory.name" hide-name hide-icon
        @show-settings="$emit('show-settings')"
    >
        <camera :service="service" />
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import AccessoryDetails from './accessory-details.vue';
    import Camera from '../layout-sections/cameras/camera.vue';

    export const uuid = 'CollapsedService.' + Service.CameraRTPStreamManagement;

    export default {
        components: {
            AccessoryDetails,
            Camera,
        },
        props: {
            service: Service,
        },
    };
</script>
