<template>
    <div class="service-container">
        <div class="service-container-header">
            <form v-if="editTitle" class="flex-fill" @submit.prevent="updateName">
                <input ref="title_edit" :id="_uid + '-name'" :value="title" type="text"
                    class="form-control form-control-sm" placeholder="Accessories" @blur="updateName" />
            </form>

            <div v-else class="flex-fill">
                <h4>{{ title || 'Accessories' }}</h4>
            </div>

            <slot name="title-right" />
        </div>

        <div class="service-container-contents">
            <draggable v-if="edit" class="draggable" :list="sorted" :group="group"
                @change="sorted => $emit('update-order', sorted)"
            >
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
            group: String,
        },
        methods: {
            updateName() {
                if (this.$refs.title_edit.value !== this.title) this.$emit('update-name', this.$refs.title_edit.value);
            },
        },
    };
</script>
