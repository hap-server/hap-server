<template>
    <div class="service-container">
        <div class="service-container-header">
            <form v-if="editTitle" class="flex-fill" @submit.prevent="$refs.title_edit.value !== title ? $emit('update-name', $refs.title_edit.value) : undefined">
                <input ref="title_edit" :id="_uid + '-name'" :value="title" type="text"
                    class="form-control form-control-sm" placeholder="Accessories"
                    @blur="() => $refs.title_edit.value !== title ? $emit('update-name', $refs.title_edit.value) : undefined" />
            </form>

            <h4 v-else class="flex-fill">{{ title || 'Accessories' }}</h4>

            <slot name="title-right" />
        </div>

        <div class="service-container-contents">
            <draggable v-if="edit" :list="sorted" :group="group" @change="sorted => $emit('update-order', sorted)">
                <template v-for="id in sorted">
                    <slot :id="id" />
                </template>
            </draggable>

            <sortable v-else :sorted="sorted" :filter-text="true">
                <template v-for="id in sorted">
                    <slot :id="id" />
                </template>
            </sortable>
        </div>
    </div>
</template>

<script>
    import Sortable from './sortable.vue';

    export default {
        components: {
            Sortable,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
        },
        props: {
            title: {type: String, default: 'Accessories'},
            accessories: Object,
            sorted: Array,
            edit: Boolean,
            editTitle: Boolean,
            group: Number,
        },
    };
</script>
