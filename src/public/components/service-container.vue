<template>
    <div class="service-container">
        <div class="service-container-header">
            <h4>{{ title || 'Accessories' }}</h4>
        </div>

        <div class="service-container-contents">
            <draggable v-if="edit" :list="sorted" :group="group" @change="sorted => $emit('update-order', sorted)">
                <template v-for="id in sorted">
                    <slot :id="id" />
                </template>
            </draggable>

            <sortable v-else :sorted="sorted" :filter-text="true">
                <template v-for="id in sorted">
                    <slot :id="id" />
                </template>
            </sortable>
        </div>
    </div>
</template>

<script>
    import Sortable from './sortable.vue';
    import Draggable from 'vuedraggable';

    export default {
        components: {
            Sortable,
            Draggable,
        },
        props: {
            title: {type: String, default: 'Accessories'},
            accessories: Object,
            sorted: Array,
            edit: Boolean,
            group: Number,
        },
    };
</script>
