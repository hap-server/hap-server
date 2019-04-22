<template>
    <div class="layout" :class="{'layout-edit': edit}">
        <h1>{{ title }}</h1>

        <div class="section">
            <button class="btn btn-default btn-sm" @click="$emit('ping')">Ping</button>
        </div>

        <component :is="edit ? 'draggable' : 'div'" :list="sections" handle=".drag-handle"
            @change="$emit('update-accessories')"
        >
            <template v-for="(section, index) in showAllAccessories && !edit ? [{accessories: getAllServices()}] : sections">
                <component v-if="section_components.has(section.type || 'Accessories')"
                    :is="section_components.get(section.type || 'Accessories').component" :accessories="accessories"
                    :key="getKeyForSection(section)" :section="section" :accessories-draggable-group="'' + _uid"
                    :editing="edit" @edit="e => edit = e" @update-name="name => updateSectionName(section, name)"
                    @update-data="data => updateSectionData(section, data)" @modal="modal => $emit('modal', modal)" />

                <layout-section v-else-if="edit" class="unknown-layout-section" :section="section"
                    :name="section.name" :editing="edit" @edit="$emit('edit', $event)"
                    @update-name="name => updateSectionName(section, name)"
                >
                    <p>Unknown layout section type "{{ section.type }}".</p>
                </layout-section>
            </template>
        </component>

        <div v-if="(!sections || !sections.length) && !edit && !showAllAccessories" class="section">
            <p>This layout has no accessories.</p>
            <button v-if="canEdit" class="btn btn-primary btn-sm" @click="edit = true">Add accessories</button>
        </div>

        <service-container v-if="edit" title="Other accessories" :accessories="accessories" :sorted="other_accessories"
            :edit="true" :group="'' + _uid"
        >
            <template v-slot="{id}">
                <service :key="id" :connection="connection" :service="getService(id)" :edit="edit"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service: getService(id), closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service: getService(id)})" />
            </template>
        </service-container>

        <!-- <h2>Display services</h2>

        <service-container v-for="accessory in accessories" v-if="accessory.display_services.length" :key="'1-' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.display_services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container>

        <h2>All services</h2>

        <service-container v-for="accessory in accessories" :key="'2' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container> -->

        <div class="section">
            <p v-if="showAllAccessories || accessories_count === total_accessories_count">{{ total_accessories_count }} accessor{{ total_accessories_count === 1 ? 'y' : 'ies' }}</p>
            <p v-else>{{ accessories_count }} of {{ total_accessories_count }} accessor{{ total_accessories_count === 1 ? 'y' : 'ies' }}</p>
        </div>
    </div>
</template>

<script>
    import Connection from '../connection';
    import Layout from '../layout';
    import {GetAllDisplayServicesSymbol, GetServiceSymbol, LayoutSymbol, LayoutAddSectionSymbol,
        LayoutRemoveSectionSymbol, LayoutGetEditingSymbol, LayoutGetCanEditSymbol, LayoutSetEditingSymbol}
        from '../internal-symbols';

    import LayoutSection from './layout-section.vue';
    import section_components from './layout-sections';

    import Service from './service.vue';
    import ServiceContainer from './service-container.vue';

    const sectionKeys = new WeakMap();
    let keysForSections = 0;

    export default {
        components: {
            LayoutSection,
            Service,
            ServiceContainer,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
        },
        props: {
            connection: Connection,
            layout: Layout,
            title: {type: String, default: 'Home'},
            sections: {type: Array, default: () => []},
            accessories: Object,
            bridgeUuids: {type: Array, default: () => []},
            showAllAccessories: Boolean,
            canEdit: Boolean,
            canDelete: Boolean,
        },
        data() {
            return {
                edit: false,
                section_components,
            };
        },
        inject: {
            getAllServices: {from: GetAllDisplayServicesSymbol},
            getService: {from: GetServiceSymbol},
        },
        provide() {
            return {
                layout: this.layout,
                editing: () => this.edit,
                connection: this.connection,
                addSection: (index, data) => this.addSection(index, data),
                removeSection: index => this.deleteSection(index),
                getService: uuid => this.getService(uuid),

                [LayoutSymbol]: this.layout,
                [LayoutAddSectionSymbol]: (index, data) => this.addSection(index, data),
                [LayoutRemoveSectionSymbol]: index => this.deleteSection(index),
                [LayoutGetEditingSymbol]: () => this.edit,
                [LayoutGetCanEditSymbol]: () => this.canEdit,
                [LayoutSetEditingSymbol]: edit => this.edit = edit,
            };
        },
        computed: {
            other_accessories() {
                return this.getAllServices().filter(uuid => this.getService(uuid) && !this.sections
                    .find(s => s.accessories && s.accessories.includes(uuid)));
            },
            accessories_count() {
                if (!this.sections) return 0;

                const accessories = new Set();

                for (const section of this.sections) {
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
                if (edit && !this.sections.length) this.addSection(0);
            },
            sections(sections) {
                if (this.edit && !sections.length) this.addSection(0);
            },
        },
        methods: {
            getSectionAccessories(section) {
                if (!section.accessories) return Object.values(this.accessories);

                return section.accessories.map(uuid => this.accessories[uuid]).filter(a => a);
            },
            addSection(index, data) {
                this.sections.splice(index || 0, 0, data || {name: 'Accessories', type: 'Accessories', accessories: []});
                this.layout.updateData(this.layout.data);
            },
            deleteSection(index) {
                this.sections.splice(index, 1);
                this.layout.updateData(this.layout.data);
            },
            getKeyForSection(section) {
                if (sectionKeys.has(section)) return sectionKeys.get(section);

                const key = keysForSections++;
                sectionKeys.set(section, key);
                return key;
            },
            updateSectionName(section, name) {
                console.log('Updating section name', section, name);

                section.name = name;
                this.layout.updateData(this.layout.data);
            },
            updateSectionData(section, data) {
                console.log('Update section data', section, data);

                Object.assign(section, data);
                this.layout.updateData(this.layout.data);
            },
            updateSectionAccessories(section, changes) {
                console.log('Updating section accessories', section, changes);

                // if (changes.added) section.accessories.splice(0, changes.added.newIndex, changes.added.element);
                // if (changes.removed) section.accessories.splice(1, changes.removed.oldIndex);

                // this.$emit('update-accessories', section, changes);
                this.layout.updateData(this.layout.data);

                if (changes.added) {
                    const service = this.getService(changes.added.element);

                    if (service && !service.data.room_name) {
                        const data = Object.assign({}, service.data, {
                            room_name: this.title,
                        });

                        const accessory_data = Object.assign({}, service.accessory.data, {
                            ['Service.' + service.uuid]: data,
                        });

                        if (!service.accessory.data.room_name) {
                            accessory_data.room_name = this.title;
                        }

                        service.accessory.updateData(accessory_data);
                    }
                }
            },
        },
    };
</script>
