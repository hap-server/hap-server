<template>
    <layout-section v-if="editing || section.accessories && section.accessories.length" class="service-container"
        :layout="layout" :section="section" :name="section.name" default-name="Accessories"
        :editing="editing" @edit="edit => $emit('edit', edit)" @update-name="name => $emit('update-name', name)"
    >
        <draggable v-if="editing" class="draggable" :list="section.accessories" :group="accessoriesDraggableGroup"
            @change="changes => $emit('update-data', {})"
        >
            <template v-for="id in section.accessories">
                <service v-if="getService(id)" :key="id" :service="getService(id)" :edit="editing"
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
    import {ConnectionSymbol, GetServiceSymbol, LayoutSymbol} from '../../internal-symbols';

    import LayoutSection from '../layout-section.vue';
    import Service from '../service.vue';
    import Sortable from '../sortable.vue';

    export const type = 'Accessories';
    export const name = 'Accessories';

    export default {
        components: {
            LayoutSection,
            Service,
            Sortable,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
        },
        props: {
            section: Object,
            accessories: Object,
            accessoriesDraggableGroup: String,
            editing: Boolean,
        },
        inject: {
            connection: {from: ConnectionSymbol},
            layout: {from: LayoutSymbol},
            getService: {from: GetServiceSymbol},
        },
        created() {
            if (!this.section.accessories) {
                this.$set(this.section, 'accessories', []);
            }
        },
    };
</script>
