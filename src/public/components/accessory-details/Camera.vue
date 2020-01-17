<template>
    <accessory-details class="accessory-details-camera"
        :name="service.name || service.accessory.name" hide-name hide-icon
        @show-settings="$emit('show-settings')"
    >
        <camera :service="service" @click.native.stop />
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import AccessoryDetails from './accessory-details.vue';
    import Camera from '../camera.vue';

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
