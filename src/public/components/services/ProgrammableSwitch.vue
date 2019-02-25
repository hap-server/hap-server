<template>
    <div class="service service-switch">
        <h5>{{ service.accessory.name }}</h5>
        <h5>{{ service.name }}</h5>
        <p>Programmable Switch</p>
    </div>
</template>

<script>
    import Service from '../../service';

    export const uuid = Service.StatelessProgrammableSwitch;

    export default {
        props: ['connection', 'service']
    };
</script>
