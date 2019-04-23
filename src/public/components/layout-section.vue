<template>
    <div class="layout-section">
        <div class="layout-section-header">
            <form v-if="editing" class="flex-fill" @submit.prevent="updateName">
                <input ref="title_edit" :id="_uid + '-name'" :value="name" type="text"
                    class="form-control form-control-sm" :placeholder="defaultName" @blur="updateName" />
            </form>

            <div v-else class="flex-fill">
                <h4>{{ name || defaultName }}</h4>
            </div>

            <slot name="title-right">
                <template v-if="editing">
                    <div class="dropdown ml-3" :class="{show: addSectionDropdownOpen}">
                        <button :id="_uid + '-dropdown'" class="btn btn-sm btn-dark dropdown-toggle" type="button"
                            data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"
                            @click.stop="addSectionDropdownOpen = !addSectionDropdownOpen">Add section</button>

                        <div class="dropdown-menu dropdown-menu-right" :class="{show: addSectionDropdownOpen}"
                            :aria-labelledby="_uid + '-dropdown'"
                        >
                            <a v-for="[type, section_component] in layout_section_components.entries()" :key="type"
                                class="dropdown-item" href="#" @click.prevent="addSection(type)"
                            >{{ section_component.name }}</a>
                        </div>
                    </div>

                    <button class="btn btn-danger btn-sm ml-3" type="button" @click="removeSection">Remove section</button>
                    <button class="btn btn-dark btn-sm ml-3 drag-handle" type="button">Drag</button>
                    <button class="btn btn-dark btn-sm ml-3" type="button" @click="setEditing(false)">Finish editing</button>
                </template>
                <template v-else-if="can_edit">
                    <button class="btn btn-dark btn-sm ml-3" type="button" @click="setEditing(true)">Edit</button>
                </template>
            </slot>
        </div>

        <div class="layout-section-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    import {LayoutSymbol, LayoutAddSectionSymbol, LayoutRemoveSectionSymbol, LayoutGetCanEditSymbol,
        LayoutSetEditingSymbol} from '../internal-symbols'; // eslint-disable-line vue/script-indent

    import layout_section_components from './layout-sections';

    export default {
        props: {
            section: Object,
            name: String,
            defaultName: {type: String, default: 'Accessories'},
            editing: Boolean,
        },
        data() {
            return {
                addSectionDropdownOpen: false,
                layout_section_components,
            };
        },
        inject: {
            layout: {from: LayoutSymbol},
            [LayoutAddSectionSymbol]: {},
            [LayoutRemoveSectionSymbol]: {},
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
        watch: {
            addSectionDropdownOpen(addSectionDropdownOpen) {
                if (addSectionDropdownOpen) document.body.addEventListener('click', this.close, true);
                else document.body.removeEventListener('click', this.close);
            },
        },
        destroy() {
            document.body.removeEventListener('click', this.close);
        },
        methods: {
            close() {
                this.addSectionDropdownOpen = false;
            },
            updateName() {
                if (this.$refs.title_edit.value !== this.name) {
                    this.$emit('update-name', this.$refs.title_edit.value);
                }
            },
            addSection(type) {
                this[LayoutAddSectionSymbol](this.layout.sections.indexOf(this.section) + 1, {type});
                this.addSectionDropdownOpen = false;
            },
            removeSection() {
                this[LayoutRemoveSectionSymbol](this.layout.sections.indexOf(this.section));
            },
        },
    };
</script>
