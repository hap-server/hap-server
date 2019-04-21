<template>
    <div class="layout-section">
        <div class="layout-section-header">
            <form v-if="editing" class="flex-fill"
                @submit.prevent="$refs.title_edit.value !== name ? $emit('update-name', $refs.title_edit.value) : undefined"
            >
                <input ref="title_edit" :id="_uid + '-name'" :value="name" type="text"
                    class="form-control form-control-sm" :placeholder="defaultName"
                    @blur="() => $refs.title_edit.value !== name ? $emit('update-name', $refs.title_edit.value) : undefined" />
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
                            <a v-for="[type, section_component] in layout_section_components.entries()" :key="type" class="dropdown-item" href="#"
                                @click.prevent="addSection(layout.sections.indexOf(section) + 1, {type}), addSectionDropdownOpen = false">{{ section_component.name }}</a>
                        </div>
                    </div>

                    <button class="btn btn-danger btn-sm ml-3" type="button"
                        @click="removeSection(layout.sections.indexOf(section))">Remove section</button>
                    <button class="btn btn-dark btn-sm ml-3 drag-handle" type="button">Drag</button>
                    <button class="btn btn-dark btn-sm ml-3" type="button" @click="$emit('edit', false)">Finish editing</button>
                </template>
                <template v-else-if="layout && layout.can_set">
                    <button class="btn btn-dark btn-sm ml-3" type="button" @click="$emit('edit', true)">Edit</button>
                </template>
            </slot>
        </div>

        <div class="layout-section-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    import Layout from '../layout';

    import layout_section_components from './layout-sections';

    export default {
        props: {
            layout: Layout,
            section: Object,
            name: String,
            defaultName: {type: String, default: 'Accessories'},
            editing: Boolean,
            editingName: Boolean,
        },
        data() {
            return {
                addSectionDropdownOpen: false,
                layout_section_components,
            };
        },
        inject: ['addSection', 'removeSection'],
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
        },
    };
</script>
