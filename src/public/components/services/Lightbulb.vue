<template>
    <div class="service service-lightbulb">
        <h5>{{ service.accessory.name }}</h5>
        <h5>{{ service.name }}</h5>
        <p>Lightbulb</p>
        <p>{{ service.getCharacteristicValueByName('On') ? 'On' : 'Off' }}</p>
    </div>
</template>

<script>
    import Service from '../../service';

    export const uuid = Service.Lightbulb;

    export default {
        props: ['connection', 'service']
    };
</script>
