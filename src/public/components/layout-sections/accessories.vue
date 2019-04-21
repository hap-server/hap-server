<template>
    <layout-section v-if="editing || section.accessories && section.accessories.length" class="service-container"
        :layout="layout" :section="section" :name="section.name" default-name="Accessories"
        :editing="editing" @edit="edit => $emit('edit', edit)" @update-name="name => $emit('update-name', name)"
    >
        <draggable v-if="editing" class="draggable" :list="section.accessories" :group="accessoriesDraggableGroup"
            @change="changes => $emit('update-data', {})"
        >
            <template v-for="id in section.accessories">
                <service v-if="getService(id)" :key="id"
                    :connection="connection" :service="getService(id)" :edit="editing"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service: getService(id), closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service: getService(id)})" />
            </template>
        </draggable>

        <sortable v-else :sorted="section.accessories" :filter-text="true">
            <template v-for="service in section.accessories.map(id => getService(id)).filter(s => s)">
                <service :key="service.accessory.uuid + '.' + service.uuid"
                    :connection="connection" :service="service" :edit="editing"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service})" />
            </template>
        </sortable>
    </layout-section>
</template>

<script>
    import Layout from '../../layout';

    import LayoutSection from '../layout-section.vue';
    import Service from '../service.vue';
    import ServiceContainer from '../service-container.vue';
    import Sortable from '../sortable.vue';

    export const type = 'Accessories';
    export const name = 'Accessories';

    export default {
        components: {
            LayoutSection,
            Service,
            ServiceContainer,
            Sortable,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
        },
        props: {
            accessories: Object,
            layout: Layout,
            section: Object,
            accessoriesDraggableGroup: String,
            editing: Boolean,
        },
        inject: ['connection', 'getService'],
        created() {
            if (!this.section.accessories) {
                this.$set(this.section, 'accessories', []);
                this.$emit('update-data', {});
            }
        },
    };
</script>
