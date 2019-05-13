<template>
    <layout-section v-if="editing || section.accessories && section.accessories.length" class="service-container"
        :layout="layout" :section="section" :name="section.name" default-name="Accessories"
        :editing="editing" @edit="edit => $emit('edit', edit)" @update-name="name => $emit('update-name', name)"
    >
        <draggable v-if="editing" v-model="effective_accessories_order" class="draggable"
            :group="accessoriesDraggableGroup" :disabled="staged_accessories_order"
        >
            <template v-for="id in effective_accessories_order">
                <service :key="id" :service="getService(id)" :edit="editing"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service: getService(id), closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service: getService(id)})" />
            </template>
        </draggable>

        <sortable v-else :sorted="effective_accessories_order" :filter-text="true">
            <template v-for="service in effective_accessories_order.map(id => getService(id))">
                <service :key="service.accessory.uuid + '.' + service.uuid"
                    :connection="connection" :service="service" :edit="editing"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service})" />
            </template>
        </sortable>
    </layout-section>
</template>

<script>
    import {LayoutSection} from '../../layout';
    import {UnavailableService} from '../../service';
    import {ConnectionSymbol, GetServiceSymbol, LayoutSymbol} from '../../internal-symbols';

    import LayoutSectionComponent from '../layout-section.vue';
    import Service from '../service.vue';
    import Sortable from '../sortable.vue';

    export const type = 'Accessories';
    export const name = 'Accessories';

    export default {
        components: {
            LayoutSection: LayoutSectionComponent,
            Service,
            Sortable,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
        },
        props: {
            section: LayoutSection,
            accessories: Object,
            accessoriesDraggableGroup: String,
            editing: Boolean,
        },
        data() {
            return {
                updating_accessories_order: null,
                staged_accessories_order: null,
            };
        },
        inject: {
            connection: {from: ConnectionSymbol},
            layout: {from: LayoutSymbol},
            _getService: {from: GetServiceSymbol},
        },
        computed: {
            effective_accessories_order: {
                get() {
                    return this.staged_accessories_order || this.accessories_order;
                },
                set(accessories_order) {
                    this.accessories_order = accessories_order;
                },
            },
            accessories_order: {
                get() {
                    return this.section.accessories || [];
                },
                set(accessories_order) {
                    if (!this.updating_accessories_order) this.updating_accessories_order = Promise.resolve();

                    const updating_accessories_order = this.updating_accessories_order.then(() => {
                        this.staged_accessories_order = accessories_order;
                        return this.section.updateData(Object.assign({}, this.section.data, {
                            accessories: accessories_order,
                        }));
                    }).catch(() => null).then(() => {
                        if (updating_accessories_order !== this.updating_accessories_order) return;
                        this.updating_accessories_order = null;
                        this.staged_accessories_order = null;
                    });

                    return this.updating_accessories_order = updating_accessories_order;
                },
            },
        },
        methods: {
            getService(uuid) {
                const service = this._getService(uuid);
                if (service) return service;

                return this.section.unavailable_service_placeholders[uuid] ||
                    this.$set(this.section.unavailable_service_placeholders, uuid,
                        UnavailableService.for(this.connection(), null, uuid)); // eslint-disable-line vue/script-indent
            },
        },
    };
</script>
