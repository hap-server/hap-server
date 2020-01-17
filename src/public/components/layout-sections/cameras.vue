<template>
    <layout-section v-if="editing || section.accessories && section.accessories.length" class="service-container"
        :layout="layout" :section="section" :name="section.name" :default-name="$t('layout_section.cameras')"
        :editing="editing" @edit="edit => $emit('edit', edit)" @update-name="name => $emit('update-name', name)"
    >
        <draggable v-if="editing" v-model="effective_accessories_order" class="draggable"
            :group="accessoriesDraggableGroup" :disabled="staged_cameras_order"
        >
            <template v-for="service in effective_cameras_order.map(id => getCameraService(id))">
                <camera :key="service.accessory.uuid" :service="service" :edit="editing"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service})" />
            </template>
        </draggable>

        <sortable v-else :sorted="effective_cameras_order" :filter-text="true">
            <template v-for="service in effective_cameras_order.map(id => getCameraService(id))">
                <camera :key="service.accessory.uuid"
                    :connection="connection" :service="service" :edit="editing"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service})" />
            </template>
        </sortable>
    </layout-section>
</template>

<script>
    import {LayoutSection} from '../../../client/layout';
    import {UnavailableService, type_uuids} from '../../../client/service';
    import {ConnectionSymbol, GetServiceSymbol, LayoutSymbol} from '../../internal-symbols';

    import LayoutSectionComponent from '../layout-section.vue';
    import Camera from './cameras/camera.vue';
    import Sortable from '../sortable.vue';

    export const type = 'Cameras';
    export const name = 'Cameras';

    export default {
        components: {
            LayoutSection: LayoutSectionComponent,
            Camera,
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
                updating_cameras_order: null,
                staged_cameras_order: null,
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
                    return this.effective_cameras_order
                        .map(u => u + '.CollapsedService.' + type_uuids.CameraRTPStreamManagement);
                },
                set(cameras_order) {
                    this.effective_cameras_order = cameras_order.filter(u =>
                        u.substr(u.indexOf('.')) === '.CollapsedService.' + type_uuids.CameraRTPStreamManagement)
                        .map(u => u.substr(0, u.indexOf('.')));
                },
            },
            effective_cameras_order: {
                get() {
                    return this.staged_cameras_order || this.cameras_order;
                },
                set(cameras_order) {
                    this.cameras_order = cameras_order;
                },
            },
            cameras_order: {
                get() {
                    return this.section.data.accessories.map(u => u.substr(0, u.indexOf('.'))) || [];
                },
                set(cameras_order) {
                    if (!this.updating_cameras_order) this.updating_cameras_order = Promise.resolve();

                    const updating_cameras_order = this.updating_cameras_order.then(() => {
                        this.staged_cameras_order = cameras_order;
                        return this.section.updateData(Object.assign({}, this.section.data, {
                            accessories: cameras_order
                                .map(u => u + '.CollapsedService.' + type_uuids.CameraRTPStreamManagement),
                        }));
                    }).catch(() => null).then(() => {
                        if (updating_cameras_order !== this.updating_cameras_order) return;
                        this.updating_cameras_order = null;
                        this.staged_cameras_order = null;
                    });

                    return this.updating_cameras_order = updating_cameras_order;
                },
            },
        },
        methods: {
            getCameraService(uuid) {
                const accessory = this.accessories[uuid];
                const service = accessory && accessory.display_services.find(s =>
                    s.collapsed_service_type === type_uuids.CameraRTPStreamManagement);
                
                if (service) return service;

                return this.section.unavailable_service_placeholders[uuid] ||
                    this.$set(this.section.unavailable_service_placeholders, uuid,
                        UnavailableService.for(this.connection(), null, uuid)); // eslint-disable-line vue/script-indent
            },
        },
    };
</script>
