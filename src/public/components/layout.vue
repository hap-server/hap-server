<template>
    <div class="layout" :class="{'layout-edit': edit}">
        <h1>{{ title || $t('layout.home') }}</h1>

        <div class="section">
            <p v-for="(status_message, key) in status_messages" :key="key" class="mb-1">{{ status_message }}</p>
        </div>

        <component :is="edit ? 'draggable' : 'div'" v-model="effective_sections" handle=".drag-handle"
            :disabled="staged_sections_order"
        >
            <template v-for="section in effective_sections">
                <component v-if="section_components.has(section.data.type || 'Accessories')"
                    :is="section_components.get(section.data.type || 'Accessories').component" :key="section.uuid"
                    :accessories="accessories" :section="section" :accessories-draggable-group="'' + _uid"
                    :editing="edit" @edit="e => edit = e" @update-name="name => updateSectionName(section, name)"
                    @update-data="data => updateSectionData(section, data)" @modal="modal => $emit('modal', modal)" />

                <layout-section v-else-if="edit" :key="section.uuid" class="unknown-layout-section"
                    :section="section" :name="section.name" :editing="edit" @edit="$emit('edit', $event)"
                    @update-name="name => updateSectionName(section, name)"
                >
                    <p>{{ $t('layout.unknown_section_type', {type: section.type}) }}</p>
                </layout-section>
            </template>
        </component>

        <div v-if="!accessories_count && !edit && !show_all_accessories" class="section">
            <p>{{ $t('layout.has_no_accessories') }}</p>
            <button v-if="can_edit" class="btn btn-primary btn-sm" @click="edit = true">
                {{ $t('layout.add_accessories') }}
            </button>
        </div>

        <service-container v-if="edit" :title="$t('layout.other_accessories')" :accessories="accessories"
            :sorted="other_accessories" :edit="true" :group="'' + _uid"
        >
            <template v-slot="{id}">
                <service :key="id" :connection="client.connection" :service="getService(id)" :edit="edit"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service: getService(id), closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service: getService(id)})" />
            </template>
        </service-container>

        <cameras v-if="show_all_accessories && camera_accessories.length" :section="all_cameras_section"
            :accessories="accessories" @modal="m => $emit('modal', m)" />

        <!-- <h2>Display services</h2>

        <service-container v-for="accessory in accessories" v-if="accessory.display_services.length" :key="'1-' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.display_services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container>

        <h2>All services</h2>

        <service-container v-for="accessory in accessories" :key="'2' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container> -->

        <div class="section">
            <p v-if="show_all_accessories || accessories_count === total_accessories_count">
                {{ $tc('layout.x_accessories', total_accessories_count) }}
            </p>
            <p v-else>
                {{ $tc('layout.x_of_x_accessories', total_accessories_count, {available: accessories_count}) }}
            </p>
        </div>
    </div>
</template>

<script>
    import Layout, {LayoutSection} from '../../client/layout';
    import Service from '../../client/service';
    import {
        ClientSymbol, AccessoriesSymbol, BridgeUUIDsSymbol, GetAllDisplayServicesSymbol, GetServiceSymbol,
        LayoutSymbol, LayoutAddSectionSymbol, LayoutRemoveSectionSymbol, LayoutGetEditingSymbol,
        LayoutGetCanEditSymbol, LayoutSetEditingSymbol,
    } from '../internal-symbols';

    import {LayoutSectionComponents as section_components} from '../component-registry';
    import LayoutSectionComponent from './layout-section.vue';

    import ServiceComponent from './service.vue';
    import ServiceContainer from './service-container.vue';
    import Cameras from './layout-sections/cameras.vue';

    export default {
        components: {
            LayoutSection: LayoutSectionComponent,
            Service: ServiceComponent,
            ServiceContainer,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
            Cameras,
        },
        props: {
            layout: Layout,
            title: {type: String, default: null},
        },
        data() {
            return {
                edit: false,
                section_components,

                updating_sections_order: null,
                staged_sections_order: null,
            };
        },
        inject: {
            client: {from: ClientSymbol},
            accessories: {from: AccessoriesSymbol},
            bridgeUuids: {from: BridgeUUIDsSymbol},
            getAllServices: {from: GetAllDisplayServicesSymbol},
            getService: {from: GetServiceSymbol},
        },
        provide() {
            return {
                layout: this.layout,
                editing: () => this.edit,
                connection: this.client.connection,
                addSection: (index, data) => this.addSection(index, data),
                removeSection: index => this.deleteSection(index),
                getService: uuid => this.getService(uuid),

                [LayoutSymbol]: this.layout,
                [LayoutAddSectionSymbol]: (index, data) => this.addSection(index, data),
                [LayoutRemoveSectionSymbol]: index => this.deleteSection(index),
                [LayoutGetEditingSymbol]: () => this.edit,
                [LayoutGetCanEditSymbol]: () => this.can_edit,
                [LayoutSetEditingSymbol]: edit => this.edit = edit,
            };
        },
        computed: {
            sections() {
                return this.layout && this.layout.sections;
            },
            can_edit() {
                return this.layout && this.layout.can_set;
            },
            show_all_accessories() {
                return !this.layout;
            },
            camera_accessories() {
                return [...Object.values(this.accessories)].filter(a =>
                    a.display_services.find(s => s.collapsed_service_type === Service.CameraRTPStreamManagement))
                    .map(a => a.uuid + '.CollapsedService.' + Service.CameraRTPStreamManagement);
            },
            effective_sections: {
                get() {
                    if (this.show_all_accessories && !this.edit) return [this.all_accessories_section];

                    return (this.staged_sections_order || this.sections_order).map(uuid => this.sections[uuid]);
                },
                set(effective_sections) {
                    this.sections_order = effective_sections.map(section => section.uuid);
                },
            },
            sections_order: {
                get() {
                    const sections_order = this.layout && this.layout.sections_order || [];

                    return sections_order.concat(Object.values(this.sections || {})
                        .filter(section => !sections_order.includes(section.uuid)).map(section => section.uuid));
                },
                set(sections_order) {
                    if (!this.updating_sections_order) this.updating_sections_order = Promise.resolve();

                    const updating_sections_order = this.updating_sections_order.then(() => {
                        this.staged_sections_order = sections_order;
                        this.$set(this.layout, 'staged_sections_order', sections_order);
                        return this.layout.updateData(Object.assign({}, this.layout.data, {sections_order}));
                    }).catch(() => null).then(() => {
                        if (updating_sections_order !== this.updating_sections_order) return;
                        this.updating_sections_order = null;
                        this.staged_sections_order = null;
                        this.$delete(this.layout, 'staged_sections_order');
                    });

                    return this.updating_sections_order = updating_sections_order;
                },
            },
            all_accessories_section() {
                return new LayoutSection(this.layout, 'AllAccessories', {accessories: this.getAllServices()});
            },
            all_cameras_section() {
                return new LayoutSection(this.layout, 'AllCameraAccessories', {accessories: this.camera_accessories});
            },
            other_accessories() {
                return this.getAllServices().filter(uuid => this.getService(uuid) && !Object.values(this.sections)
                    .find(s => s.accessories && s.accessories.includes(uuid)));
            },
            status() {
                const status = {
                    light_services: [], light_rooms: [], lights_count: 0,
                    active_light_services: [], active_light_rooms: [], active_lights_count: 0,
                    tv_services: [], tv_rooms: [], active_tv_services: [], active_tv_rooms: [], tv_on: false,
                    outlet_services: [], outlet_rooms: [], outlets_count: 0,
                    active_outlet_services: [], active_outlet_rooms: [], active_outlets_count: 0,
                    switch_services: [], switch_rooms: [], switches_count: 0,
                    active_switch_services: [], active_switch_rooms: [], active_switches_count: 0,
                };

                for (const section of Object.values(this.sections || {})) {
                    if (!section.accessories) continue;

                    for (const uuid of section.accessories) {
                        const service = this.getService(uuid);
                        if (!service) continue;

                        if (service.type === Service.Lightbulb) {
                            status.lights_count++;
                            if (!status.light_services.includes(service)) status.light_services.push(service);
                            if (!status.light_rooms.includes(service.data.room_name ||
                                service.accessory.data.room_name
                            )) {
                                status.light_rooms.push(service.data.room_name || service.accessory.data.room_name);
                            }

                            if (service.getCharacteristicValueByName('On')) {
                                status.active_lights_count++;
                                if (!status.active_light_services.includes(service)) {
                                    status.active_light_services.push(service);
                                }
                                if (!status.active_light_rooms.includes(service.data.room_name ||
                                    service.accessory.data.room_name
                                )) {
                                    status.active_light_rooms.push(service.data.room_name ||
                                        service.accessory.data.room_name);
                                }
                            }
                        }

                        if (service.type === 'CollapsedService.' + Service.Television) {
                            if (!status.tv_services.includes(service)) status.tv_services.push(service);
                            if (!status.tv_rooms.includes(service.data.room_name || service.accessory.data.room_name)) {
                                status.tv_rooms.push(service.data.room_name || service.accessory.data.room_name);
                            }

                            if (service.getCharacteristicValueByName('Active')) {
                                status.tv_on = true;
                                if (!status.active_tv_services.includes(service)) {
                                    status.active_tv_services.push(service);
                                }
                                if (!status.active_tv_rooms.includes(service.data.room_name ||
                                    service.accessory.data.room_name
                                )) {
                                    status.active_tv_rooms.push(service.data.room_name ||
                                        service.accessory.data.room_name);
                                }
                            }
                        }

                        if (service.type === Service.Outlet) {
                            status.outlets_count++;
                            if (!status.outlet_services.includes(service)) status.outlet_services.push(service);
                            if (!status.outlet_rooms.includes(service.data.room_name ||
                                service.accessory.data.room_name
                            )) {
                                status.outlet_rooms.push(service.data.room_name || service.accessory.data.room_name);
                            }

                            if (service.getCharacteristicValueByName('On')) {
                                status.active_outlets_count++;
                                if (!status.active_outlet_services.includes(service)) {
                                    status.active_outlet_services.push(service);
                                }
                                if (!status.active_outlet_rooms.includes(service.data.room_name ||
                                    service.accessory.data.room_name
                                )) {
                                    status.active_outlet_rooms.push(service.data.room_name ||
                                        service.accessory.data.room_name);
                                }
                            }
                        }

                        if (service.type === Service.Switch) {
                            status.switches_count++;
                            if (!status.switch_services.includes(service)) status.switch_services.push(service);
                            if (!status.switch_rooms.includes(service.data.room_name ||
                                service.accessory.data.room_name
                            )) {
                                status.switch_rooms.push(service.data.room_name || service.accessory.data.room_name);
                            }

                            if (service.getCharacteristicValueByName('On')) {
                                status.active_switches_count++;
                                if (!status.active_switch_services.includes(service)) {
                                    status.active_switch_services.push(service);
                                }
                                if (!status.active_switch_rooms.includes(service.data.room_name ||
                                    service.accessory.data.room_name
                                )) {
                                    status.active_switch_rooms.push(service.data.room_name ||
                                        service.accessory.data.room_name);
                                }
                            }
                        }
                    }
                }

                return status;
            },
            status_messages() {
                // TODO: This - maybe move to a separate component?

                const status = this.status;
                const status_messages = {};

                // Lights
                if (status.active_lights_count && status.active_light_rooms.length === 1 &&
                    status.active_light_rooms[0] && !status.light_services.find(s =>
                        ((s.data.room_name || s.accessory.data.room_name) !== status.active_light_rooms[0] &&
                            status.active_light_services.includes(s)) ||
                        ((s.data.room_name || s.accessory.data.room_name) === status.active_light_rooms[0] &&
                            !status.active_light_services.includes(s))) &&
                    status.light_rooms.length !== 1
                ) {
                    status_messages.lights = status.active_light_rooms[0] + ' light' +
                        (status.active_lights_count === 1 ? '' : 's') + ' on.';
                } else if (status.active_lights_count && status.lights_count === status.active_lights_count) {
                    status_messages.lights = `Light${status.active_lights_count === 1 ? '' : 's'} on.`;
                } else if (status.active_lights_count) {
                    status_messages.lights = status.active_lights_count + ' light' +
                        (status.active_lights_count === 1 ? '' : 's') + ' on.';
                }

                // TVs
                if (status.tv_on && status.active_tv_rooms.length === 1 &&
                    status.active_tv_rooms[0] && !status.tv_services.find(s =>
                        ((s.data.room_name || s.accessory.data.room_name) !== status.active_tv_rooms[0] &&
                            status.active_tv_services.includes(s)) ||
                        ((s.data.room_name || s.accessory.data.room_name) === status.active_tv_rooms[0] &&
                            !status.active_tv_services.includes(s)))
                ) {
                    status_messages.tv = `${status.active_tv_rooms[0]} TV on.`;
                } else if (status.tv_on) status_messages.tv = `TV on.`;

                // Outlets/power points
                if (status.active_outlets_count && status.active_outlet_rooms.length === 1 &&
                    status.active_outlet_rooms[0] && !status.outlet_services.find(s =>
                        ((s.data.room_name || s.accessory.data.room_name) !== status.active_outlet_rooms[0] &&
                            status.active_outlet_services.includes(s)) ||
                        ((s.data.room_name || s.accessory.data.room_name) === status.active_outlet_rooms[0] &&
                            !status.active_outlet_services.includes(s))) &&
                    status.outlet_rooms.length !== 1
                ) {
                    status_messages.outlets = status.active_outlet_rooms[0] + ' power point' +
                        (status.active_outlets_count === 1 ? '' : 's') + ' on.';
                } else if (status.active_outlets_count && status.outlets_count === status.active_outlets_count) {
                    status_messages.outlets = `Power point${status.active_outlets_count === 1 ? '' : 's'} on.`;
                } else if (status.active_outlets_count) {
                    status_messages.outlets = status.active_outlets_count + ' power point' +
                        (status.active_outlets_count === 1 ? '' : 's') + ' on.';
                }

                // Switches
                if (status.active_switches_count && status.active_switch_rooms.length === 1 &&
                    status.active_switch_rooms[0] && !status.switch_services.find(s =>
                        ((s.data.room_name || s.accessory.data.room_name) !== status.active_switch_rooms[0] &&
                            status.active_switch_services.includes(s)) ||
                        ((s.data.room_name || s.accessory.data.room_name) === status.active_switch_rooms[0] &&
                            !status.active_switch_services.includes(s))) &&
                    status.switch_rooms.length !== 1
                ) {
                    status_messages.switches = status.active_switch_rooms[0] + ' switch' +
                        (status.active_switches_count === 1 ? '' : 'es') + ' on.';
                } else if (status.active_switches_count && status.switches_count === status.active_switches_count) {
                    status_messages.switches = `Switch${status.active_switches_count === 1 ? '' : 'es'} on.`;
                } else if (status.active_switches_count) {
                    status_messages.switches = status.active_switches_count + ' switch' +
                        (status.active_switches_count === 1 ? '' : 'es') + ' on.';
                }

                return status_messages;
            },
            accessories_count() {
                if (!this.sections) return 0;

                const accessories = new Set();

                for (const section of Object.values(this.sections || {})) {
                    if (!section.accessories) continue;

                    for (const uuid of section.accessories) {
                        const service = this.getService(uuid);
                        if (!service) continue;
                        accessories.add(service.accessory);
                    }
                }

                return accessories.size;
            },
            total_accessories_count() {
                return Object.keys(this.accessories).length;
            },
        },
        watch: {
            edit(edit) {
                if (edit && !Object.keys(this.sections).length) this.addSection(0);
            },
            sections(sections) {
                if (this.edit && !Object.keys(sections).length) this.addSection(0);
            },
        },
        created() {
            // Register built in components
            require('./layout-sections');
        },
        methods: {
            getSectionAccessories(section) {
                if (!section.accessories) return Object.values(this.accessories);

                return section.accessories.map(uuid => this.accessories[uuid]).filter(a => a);
            },
            addSection(index, data) {
                this.layout.addSection(data, index);
            },
            deleteSection(section) {
                this.layout.deleteSection(section);
            },
            updateSectionName(section, name) {
                console.log('Updating section name', section, name);

                return this.updateSectionData(section, {name});
            },
            updateSectionData(section, data) {
                console.log('Update section data', section, data);

                return section.updateData(Object.assign({}, section.data, data));
            },
            updateSectionAccessories(section, changes) {
                console.log('Updating section accessories', section, changes);

                section.updateData(section.data);

                if (changes.added) {
                    const service = this.getService(changes.added.element);

                    if (service && !service.data.room_name) {
                        const data = Object.assign({}, service.data, {
                            room_name: this.layout.name,
                        });

                        const accessory_data = Object.assign({}, service.accessory.data, {
                            ['Service.' + service.uuid]: data,
                        });

                        if (!service.accessory.data.room_name) {
                            accessory_data.room_name = this.layout.name;
                        }

                        service.accessory.updateData(accessory_data);
                    }
                }
            },
        },
    };
</script>
