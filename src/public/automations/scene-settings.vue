<template>
    <panel class="scene-settings" ref="panel" @close="$emit('close')">
        <panel-tabs v-model="tab" :tabs="tabs" />

        <form v-if="tab === 'general'" @submit.prevent="$emit('save', true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="data.name" type="text"
                        class="form-control form-control-sm" :disabled="saving || (scene && !scene.can_set)" />
                </div>
            </div>
        </form>

        <div v-if="tab === 'conditions'" class="automation-conditions">
            <p>All of these conditions must be met for the scene to be considered active.</p>

            <template v-for="(condition, id) in data.conditions || {}">
                <component
                    v-if="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition) && simple_editor"
                    :is="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition).component"
                    :key="id" :id="id" :condition="condition" :editable="!scene || scene.can_set" :saving="saving || deleting"
                    @delete="$delete(data.conditions, id); $forceUpdate()" />

                <json-editor v-else v-model="data.conditions[id]" :key="id" :index="id"
                    :name="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition) &&
                        condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition).name"
                    type="condition" :disabled="(scene && !scene.can_set) || saving || deleting"
                    @delete="$delete(data.conditions, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'activate_actions'" class="automation-actions">
            <p>These actions will be run when activating this scene.</p>

            <template v-for="(action, id) in data.enable_actions || {}">
                <component
                    v-if="action_components.find(c => c.plugin === action.plugin && c.type === action.action) && simple_editor"
                    :is="action_components.find(c => c.plugin === action.plugin && c.type === action.action).component"
                    :key="id" :id="id" :action="action" :editable="!scene || scene.can_set" :saving="saving || deleting"
                    @delete="$delete(data.enable_actions, id); $forceUpdate()" />

                <json-editor v-else v-model="data.enable_actions[id]" :key="id" :index="id"
                    :name="action_components.find(c => c.plugin === action.plugin && c.type === action.action) &&
                        action_components.find(c => c.plugin === action.plugin && c.type === action.action).name"
                    type="action" :disabled="(scene && !scene.can_set) || saving || deleting"
                    @delete="$delete(data.enable_actions, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'deactivate_actions'" class="automation-actions">
            <p>These actions will be run when deactivating this scene.</p>

            <template v-for="(action, id) in data.disable_actions || {}">
                <component
                    v-if="action_components.find(c => c.plugin === action.plugin && c.type === action.action) && simple_editor"
                    :is="action_components.find(c => c.plugin === action.plugin && c.type === action.action).component"
                    :key="id" :id="id" :action="action" :editable="!scene || scene.can_set" :saving="saving || deleting"
                    @delete="$delete(data.disable_actions, id); $forceUpdate()" />

                <json-editor v-else v-model="data.disable_actions[id]" :key="id" :index="id"
                    :name="action_components.find(c => c.plugin === action.plugin && c.type === action.action) &&
                        action_components.find(c => c.plugin === action.plugin && c.type === action.action).name"
                    type="action" :disabled="(scene && !scene.can_set) || saving || deleting"
                    @delete="$delete(data.disable_actions, id); $forceUpdate()" />
            </template>
        </div>

        <div class="d-flex">
            <div v-if="['conditions', 'activate_actions', 'deactivate_actions'].includes(tab)" class="form-group custom-control custom-checkbox mb-0">
                <input v-model="simple_editor" :id="_uid + '-editor'" type="checkbox"
                    class="custom-control-input" />
                <label class="custom-control-label" :for="_uid + '-editor'">Editor</label>
            </div>

            <dropdown v-if="tab === 'conditions' && (!scene || scene.can_set)" label="Add condition" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in condition_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
                >{{ name }}</a>
                <div v-if="!simple_editor" class="dropdown-divider" />
                <a v-if="!simple_editor" class="dropdown-item" href="#" @click.prevent="addCondition({plugin: null, condition: null})">Other</a>
            </dropdown>

            <dropdown v-if="tab === 'activate_actions' && (!scene || scene.can_set)" label="Add action" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addActivateAction({plugin, action: type})"
                >{{ name }}</a>
                <div v-if="!simple_editor" class="dropdown-divider" />
                <a v-if="!simple_editor" class="dropdown-item" href="#" @click.prevent="addActivateAction({plugin: null, action: null})">Other</a>
            </dropdown>

            <dropdown v-if="tab === 'deactivate_actions' && (!scene || scene.can_set)" label="Add action" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addDeactivateAction({plugin, action: type})"
                >{{ name }}</a>
                <div v-if="!simple_editor" class="dropdown-divider" />
                <a v-if="!simple_editor" class="dropdown-item" href="#" @click.prevent="addDeactivateAction({plugin: null, action: null})">Other</a>
            </dropdown>

            <div v-if="deleting">Deleting</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button v-if="changed" class="btn btn-default btn-sm" type="button" :disabled="saving || deleting"
                @click="() => $refs.panel.close()">Cancel</button>&nbsp;
            <button v-if="scene && scene.can_delete" class="btn btn-danger btn-sm" type="button"
                :disabled="saving || deleting" @click="deleteScene">Delete</button>&nbsp;
            <button v-if="(!scene || scene.can_set) && changed" class="btn btn-primary btn-sm" type="button"
                :disabled="saving || deleting" @click="save">Save</button>
            <button v-else class="btn btn-primary btn-sm" type="button" :disabled="saving || deleting"
                @click="() => $refs.panel.close()">Done</button>
        </div>
    </panel>
</template>

<script>
    import isEqual from 'lodash.isequal';

    import Scene from '../../client/scene';
    import {ConnectionSymbol} from '../internal-symbols';

    import Panel from '../components/panel.vue';
    import PanelTabs from '../components/panel-tabs.vue';
    import Dropdown from '../components/dropdown.vue';
    import JsonEditor from './json-editor.vue';

    import {
        AutomationConditionComponents as condition_components,
        AutomationActionComponents as action_components,
    } from '../component-registry';
    import './conditions';
    import './actions';

    export default {
        components: {
            Panel,
            PanelTabs,
            Dropdown,
            JsonEditor,
        },
        props: {
            scene: Scene,
            create: Boolean,
        },
        data() {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const $vm = this;

            return {
                tab: 'general',
                tabs: {
                    general: 'General',
                    conditions: {
                        label: 'Active conditions',
                        get badge() {
                            return Object.keys($vm.data.conditions || {}).length;
                        },
                    },
                    activate_actions: {
                        label: 'Activate actions',
                        get badge() {
                            return Object.keys($vm.data.enable_actions || {}).length;
                        },
                    },
                    deactivate_actions: {
                        label: 'Deactivate actions',
                        get badge() {
                            return Object.keys($vm.data.disable_actions || {}).length;
                        },
                    },
                },

                condition_components,
                action_components,

                data: null,
                saving: false,
                deleting: false,
                simple_editor: true,
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
            close_with_escape_key() {
                if (this.changed) return !this.saving && !this.deleting;
                if (this.scene && this.scene.can_delete) return !this.saving && !this.deleting;
                if ((!this.scene || this.scene.can_set) && this.changed) return !this.saving && !this.deleting;
                return !this.saving && !this.deleting;
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
            async save(close) {
                if (this.saving || this.deleting) throw new Error('Already saving');
                this.saving = true;

                try {
                    if (this.create) {
                        const data = JSON.parse(JSON.stringify(this.data));
                        const [uuid] = await this.connection.createScenes(data);

                        const [[scene_permissions]] = await Promise.all([
                            this.connection.getScenesPermissions(uuid),
                        ]);

                        const scene = new Scene(this.connection, uuid, data, false, scene_permissions);

                        this.$emit('created', scene);
                    } else {
                        await this.scene.updateData(this.data);
                    }

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            async deleteScene() {
                if (this.deleting || this.saving) throw new Error('Already deleting');
                this.deleting = true;

                try {
                    await this.connection.deleteScenes(this.scene.uuid);

                    this.$emit('remove', this.scene);
                    this.$emit('close');
                } finally {
                    this.deleting = false;
                }
            },
        },
    };
</script>
