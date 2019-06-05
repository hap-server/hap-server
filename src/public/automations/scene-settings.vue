<template>
    <panel class="scene-settings" ref="panel" @close="$emit('close')">
        <panel-tabs v-model="tab" :tabs="tabs" />

        <form v-if="tab === 'general'" @submit.prevent="$emit('save', true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="data.name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>
        </form>

        <div v-if="tab === 'conditions'" class="automation-conditions">
            <p>All of these conditions must be met for the scene to be considered active.</p>

            <template v-for="(condition, id) in data.conditions || {}">
                <component
                    v-if="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition)"
                    :is="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition).component"
                    :key="id" :id="id" :condition="condition" :editable="!scene || scene.can_set" :saving="saving || deleting"
                    @delete="$delete(data.conditions, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'activate_actions'" class="automation-actions">
            <p>These actions will be run when activating this scene.</p>

            <template v-for="(action, id) in data.enable_actions || {}">
                <component
                    v-if="action_components.find(c => c.plugin === action.plugin && c.type === action.action)"
                    :is="action_components.find(c => c.plugin === action.plugin && c.type === action.action).component"
                    :key="id" :id="id" :action="action" :editable="!scene || scene.can_set" :saving="saving || deleting"
                    @delete="$delete(data.enable_actions, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'deactivate_actions'" class="automation-actions">
            <p>These actions will be run when deactivating this scene.</p>

            <template v-for="(action, id) in data.disable_actions || {}">
                <component
                    v-if="action_components.find(c => c.plugin === action.plugin && c.type === action.action)"
                    :is="action_components.find(c => c.plugin === action.plugin && c.type === action.action).component"
                    :key="id" :id="id" :action="action" :editable="!scene || scene.can_set" :saving="saving || deleting"
                    @delete="$delete(data.disable_actions, id); $forceUpdate()" />
            </template>
        </div>

        <div class="d-flex">
            <dropdown v-if="tab === 'conditions' && (!scene || scene.can_set)" label="Add condition" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in condition_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
                >{{ name }}</a>
            </dropdown>

            <dropdown v-if="tab === 'activate_actions' && (!scene || scene.can_set)" label="Add action" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addActivateAction({plugin, action: type})"
                >{{ name }}</a>
            </dropdown>

            <dropdown v-if="tab === 'deactivate_actions' && (!scene || scene.can_set)" label="Add action" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addDeactivateAction({plugin, action: type})"
                >{{ name }}</a>
            </dropdown>

            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="saving || deleting"
                @click="() => ($emit('reset'), $refs.panel.close())">Cancel</button>&nbsp;
            <!-- <button v-if="exists && deletable" class="btn btn-danger btn-sm" type="button"
                :disabled="saving || deleting" @click="delete">Delete</button>&nbsp; -->
            <button v-if="!scene || scene.can_set" class="btn btn-primary btn-sm" type="button"
                :disabled="!changed || saving || deleting" @click="save">Save</button>
        </div>
    </panel>
</template>

<script>
    import isEqual from 'lodash.isequal';

    import Connection from '../../common/connection';
    import Scene from '../../common/scene';
    import {ConnectionSymbol} from '../internal-symbols';

    import Panel from '../components/panel.vue';
    import PanelTabs from '../components/panel-tabs.vue';
    import Dropdown from '../components/dropdown.vue';

    import {condition_components, action_components} from '.';
    import './conditions';
    import './actions';

    export default {
        components: {
            Panel,
            PanelTabs,
            Dropdown,
        },
        props: {
            scene: Scene,
            create: Boolean,
        },
        data() {
            const $vm = this;

            return {
                tab: 'general',
                tabs: {
                    general: 'General',
                    conditions: {label: 'Active conditions', get badge() {return Object.keys($vm.data.conditions || {}).length}},
                    activate_actions: {label: 'Activate actions', get badge() {return Object.keys($vm.data.enable_actions || {}).length}},
                    deactivate_actions: {label: 'Deactivate actions', get badge() {return Object.keys($vm.data.disable_actions || {}).length}},
                },

                condition_components,
                action_components,

                data: null,
                saving: false,
                deleting: false,
            };
        },
        inject: {
            _connection: {from: ConnectionSymbol},
        },
        computed: {
            connection() {
                return this._connection();
            },
            changed() {
                if (!this.scene) return true;

                return !isEqual(this.scene.data, this.data);
            },
        },
        watch: {
            'scene.data'() {
                this.data = JSON.parse(JSON.stringify(this.scene.data));
            },
        },
        created() {
            this.data = this.scene ? JSON.parse(JSON.stringify(this.scene.data)) : {};
        },
        methods: {
            addCondition(data) {
                if (!this.data.conditions) this.$set(this.data, 'conditions', {});

                let id = 0;
                while (this.data.conditions[id]) id++;

                this.$set(this.data.conditions, id, data || {});
                this.$forceUpdate();
            },
            addActivateAction(data) {
                if (!this.data.enable_actions) this.$set(this.data, 'enable_actions', {});

                let id = 0;
                while (this.data.enable_actions[id]) id++;

                this.$set(this.data.enable_actions, id, data || {});
                this.$forceUpdate();
            },
            addDeactivateAction(data) {
                if (!this.data.disable_actions) this.$set(this.data, 'disable_actions', {});

                let id = 0;
                while (this.data.disable_actions[id]) id++;

                this.$set(this.data.disable_actions, id, data || {});
                this.$forceUpdate();
            },
            async save() {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    if (this.create) {
                        const data = JSON.parse(JSON.stringify(this.data));
                        const [uuid] = await this.connection.createScenes(data);

                        const [[scene_permissions]] = await Promise.all([
                            this.connection.getScenesPermissions(uuid),
                        ]);

                        const scene = new Scene(this.connection, uuid, data, scene_permissions);

                        this.$emit('created', scene);
                    } else {
                        await this.scene.updateData(this.data);
                    }
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
