<template>
    <div class="service service-switch">
        <h5>{{ service.name || service.accessory.name }}</h5>
        <p>Switch</p>
        <p>{{ service.getCharacteristicValueByName('On') ? 'On' : 'Off' }}</p>
    </div>
</template>

<script>
    import Service from '../../service';

    export const uuid = Service.Switch;

    export default {
        props: ['connection', 'service']
    };
</script>
