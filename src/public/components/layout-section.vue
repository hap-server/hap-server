<template>
    <div class="layout-section">
        <div class="layout-section-header">
            <form v-if="editing" class="flex-fill" @submit.prevent="updateName">
                <input :id="_uid + '-name'" ref="title_edit" :value="name" type="text"
                    class="form-control form-control-sm" :placeholder="defaultName" @blur="updateName" />
            </form>

            <div v-else class="flex-fill">
                <h4>{{ name || defaultName }}</h4>
            </div>

            <slot name="title-right">
                <slot name="actions" />

                <template v-if="editing">
                    <dropdown class="ml-3" label="Add section" colour="dark" align="right">
                        <a v-for="[type, section_component] in layout_section_components.entries()" :key="type"
                            class="dropdown-item" href="#" @click.prevent="addSection(type)"
                        >{{ section_component.name }}</a>
                    </dropdown>

                    <button class="btn btn-danger btn-sm ml-3" type="button"
                        @click="removeSection">Remove section</button>
                    <button class="btn btn-dark btn-sm ml-3 drag-handle" type="button"
                        :disabled="layout.staged_sections_order">Drag</button>
                    <button class="btn btn-dark btn-sm ml-3" type="button"
                        @click="() => $listeners.edit ? $emit('edit', false) : setEditing(false)">Finish editing</button>
                </template>
                <template v-else-if="can_edit">
                    <button class="btn btn-dark btn-sm ml-3 layout-section-edit-button" type="button"
                        @click="() => $listeners.edit ? $emit('edit', true) : setEditing(true)">Edit</button>
                </template>
            </slot>
        </div>

        <div class="layout-section-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    import {LayoutSection} from '../../common/layout';
    import {LayoutSymbol, LayoutAddSectionSymbol, LayoutRemoveSectionSymbol, LayoutGetCanEditSymbol,
        LayoutSetEditingSymbol} from '../internal-symbols'; // eslint-disable-line vue/script-indent

    import layout_section_components from './layout-sections';
    import Dropdown from './dropdown.vue';

    export default {
        components: {
            Dropdown,
        },
        props: {
            section: LayoutSection,
            name: String,
            defaultName: {type: String, default: 'Accessories'},
            editing: Boolean,
        },
        data() {
            return {
                layout_section_components,
            };
        },
        inject: {
            layout: {from: LayoutSymbol},
            _addSection: {from: LayoutAddSectionSymbol},
            _removeSection: {from: LayoutRemoveSectionSymbol},
            getCanEdit: {from: LayoutGetCanEditSymbol},
            setEditing: {from: LayoutSetEditingSymbol},
        },
        computed: {
            section_index() {
                return this.layout.sections.indexOf(this.section);
            },
            can_edit() {
                return this.getCanEdit();
            },
        },
        methods: {
            updateName() {
                if (this.$refs.title_edit.value !== this.name) {
                    this.$emit('update-name', this.$refs.title_edit.value);
                }
            },
            addSection(type) {
                if (this.layout.staged_sections_order) return;
                this._addSection((this.layout.staged_sections_order || this.layout.sections_order).indexOf(this.section.uuid) + 1, {type});
            },
            removeSection() {
                this._removeSection(this.section);
            },
        },
    };
</script>
