<template>
    <div class="service service-switch">
        <h5>{{ service.name }}</h5>
        <p>Switch</p>
    </div>
</template>

<script>
    export const uuid = '00000049-0000-1000-8000-0026BB765291';

    export default {
        props: ['connection', 'service']
    };
</script>
