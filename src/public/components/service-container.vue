<template>
    <div class="service-container">
        <div class="service-container-header">
            <h4>{{ title || 'Accessories' }}</h4>
        </div>

        <div class="service-container-contents">
            <sortable :sorted="sorted" :filter-text="true">
                <slot />
            </sortable>
        </div>
    </div>
</template>

<script>
    import Sortable from './sortable.vue';

    export default {
        props: ['title', 'sorted'],
        components: {
            Sortable,
        }
    };
</script>
