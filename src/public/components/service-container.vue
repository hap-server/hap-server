<template>
    <div class="service-container">
        <div class="service-container-header">
            <h4>{{ title || 'Accessories' }}</h4>
        </div>

        <div class="service-container-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
        props: ['title']
    };
</script>
