<template>
    <layout-section :section="section" :name="section.name" default-name="Scenes" :editing="editing"
        @update-name="name => $emit('update-name', name)"
    >
        <p>Not supported <i>yet</i>.</p>
    </layout-section>
</template>

<script>
    import LayoutSection from '../layout-section.vue';

    export const type = 'Scenes';
    export const name = 'Scenes';

    export default {
        components: {
            LayoutSection,
        },
        props: {
            section: Object,
            accessories: Object,
            accessoriesDraggableGroup: String,
            editing: Boolean,
        },
    };
</script>
