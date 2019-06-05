<template>
    <layout-section v-if="editing || Object.values(scenes).filter(s => effective_scenes_order.includes(s.uuid)).length"
        class="scene-container" :section="section" :name="section.name" default-name="Scenes" :editing="editing"
        @update-name="name => $emit('update-name', name)"
    >
        <template v-if="editing" slot="actions">
            <dropdown v-if="Object.values(scenes).filter(s => !effective_scenes_order.includes(s.uuid)).length"
                class="ml-3" label="Add scene" colour="dark" align="right"
            >
                <a v-for="scene in Object.values(scenes).filter(s => !effective_scenes_order.includes(s.uuid))"
                    :key="scene.uuid" class="dropdown-item" href="#" @click.prevent="addScene(scene)"
                >{{ scene.data.name || scene.uuid }}</a>

                <div class="dropdown-divider" />
                <a class="dropdown-item" href="#" @click.prevent="createScene">New</a>
            </dropdown>

            <button v-else class="btn btn-sm btn-dark ml-3" @click="createScene">Add scene</button>
        </template>

        <draggable v-if="editing && show_remove_drop_target" class="draggable remove-drop-target" :list="[]"
            :group="accessoriesDraggableGroup + '-scenes'" />

        <draggable v-if="editing" v-model="effective_scenes_order" class="draggable"
            :group="accessoriesDraggableGroup + '-scenes'" :disabled="staged_scenes_order"
            @start="show_remove_drop_target = true" @end="show_remove_drop_target = false" @change="change"
        >
            <template v-for="id in effective_scenes_order">
                <scene v-if="scenes[id]" :key="id" :scene="scenes[id]" :editing="editing" />
            </template>
        </draggable>

        <sortable v-else :sorted="effective_scenes_order" :filter-text="true">
            <template v-for="scene in effective_scenes_order.map(id => scenes[id])">
                <scene v-if="scene" :key="scene.uuid" :scene="scene" :editing="editing" />
            </template>
        </sortable>
    </layout-section>
</template>

<script>
    import {ConnectionSymbol, ScenesSymbol, PushModalSymbol} from '../../internal-symbols';
    import LayoutSection from '../layout-section.vue';
    import Dropdown from '../dropdown.vue';
    import Sortable from '../sortable.vue';
    import SceneComponent from './scenes/scene.vue';

    export const type = 'Scenes';
    export const name = 'Scenes';

    export default {
        components: {
            LayoutSection,
            Dropdown,
            Sortable,
            Draggable: () => import(/* webpackChunkName: 'layout-editor' */ 'vuedraggable'),
            Scene: SceneComponent,
        },
        props: {
            section: Object,
            accessoriesDraggableGroup: String,
            editing: Boolean,
        },
        inject: {
            connection: {from: ConnectionSymbol},
            scenes: {from: ScenesSymbol},
            pushModal: {from: PushModalSymbol},
        },
        data() {
            return {
                updating_scenes_order: null,
                staged_scenes_order: null,
                show_remove_drop_target: false,
            };
        },
        computed: {
            effective_scenes_order: {
                get() {
                    return this.staged_scenes_order || this.scenes_order;
                },
                set(scenes_order) {
                    this.scenes_order = scenes_order;
                },
            },
            scenes_order: {
                get() {
                    return this.section.data.scenes || [];
                },
                set(scenes_order) {
                    if (!this.updating_scenes_order) this.updating_scenes_order = Promise.resolve();

                    const updating_scenes_order = this.updating_scenes_order.then(() => {
                        this.staged_scenes_order = scenes_order;
                        return this.section.updateData(Object.assign({}, this.section.data, {
                            scenes: scenes_order,
                        }));
                    }).catch(() => null).then(() => {
                        if (updating_scenes_order !== this.updating_scenes_order) return;
                        this.updating_scenes_order = null;
                        this.staged_scenes_order = null;
                    });

                    return this.updating_scenes_order = updating_scenes_order;
                },
            },
        },
        methods: {
            createScene() {
                this.pushModal({type: 'create-scene'});
            },
            addScene(scene) {
                this.effective_scenes_order = this.effective_scenes_order.concat([scene.uuid]);
            },
            change(changes) {
                if (changes.added && this.effective_scenes_order.includes(changes.added.element)) {
                    this.effective_scenes_order.splice(changes.added.newIndex, 1);
                }
            },
        },
    };
</script>
