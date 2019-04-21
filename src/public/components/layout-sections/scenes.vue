<template>
    <layout-section :layout="layout" :section="section" :name="section.name" default-name="Scenes"
        :editing="editing" @edit="edit => $emit('edit', edit)" @update-name="name => $emit('update-name', name)"
    >
        <p>Not supported <i>yet</i>.</p>
    </layout-section>
</template>

<script>
    import Layout from '../../layout';

    import LayoutSection from '../layout-section.vue';

    export const type = 'Scenes';
    export const name = 'Scenes';

    export default {
        components: {
            LayoutSection,
        },
        props: {
            accessories: Object,
            layout: Layout,
            section: Object,
            accessoriesDraggableGroup: String,
            editing: Boolean,
        },
    };
</script>
