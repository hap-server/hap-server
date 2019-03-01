<template>
    <div class="service service-bridge">
        <h5>{{ service.accessory.name }}</h5>
        <p>Bridge</p>
    </div>
</template>

<script>
    // This isn't a real service
    export const uuid = '--bridge';

    export default {
        props: ['connection', 'service']
    };
</script>
