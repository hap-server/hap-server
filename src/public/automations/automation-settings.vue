<template>
    <panel class="automation-settings" ref="panel" @close="$emit('close')">
        <panel-tabs v-model="tab" :tabs="tabs" />

        <form v-if="tab === 'general'" @submit.prevent="$emit('save', true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">
                    {{ $t('automation_settings.name') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="automation.data.name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-group'">
                    {{ $t('automation_settings.group') }}
                </label>
                <div class="col-sm-9">
                    <div class="input-group">
                        <input :id="_uid + '-group'" v-model="automation.data.group_name" type="text"
                            class="form-control form-control-sm" :disabled="saving" />

                        <dropdown v-if="group_names.length" ref="group_names_dropdown" class="input-group-append"
                            button-class="btn-outline-secondary" align="right"
                            :label="$t('automation_settings.recents')"
                        >
                            <button v-for="group_name in group_names" :key="group_name" class="dropdown-item"
                                @click.prevent="$set(automation.data, 'group_name', group_name), $refs.group_names_dropdown.open = false"
                            >{{ group_name }}</button>
                        </dropdown>
                    </div>
                </div>
            </div>
        </form>

        <div v-if="tab === 'triggers'" class="automation-triggers">
            <p>{{ $t('automation_settings.triggers_description') }}</p>
            <p>{{ $tc('automation_settings.triggers_description_other', other_automation_triggers.length) }}</p>

            <template v-for="(trigger, id) in automation.data.triggers || {}">
                <component
                    v-if="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger) && simple_editor"
                    :is="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger).component"
                    :key="id" :id="id" :trigger="trigger" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.triggers, id); $forceUpdate()" />

                <json-editor v-else v-model="automation.data.triggers[id]" :key="id" :index="id"
                    :name="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger) &&
                        trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger).name"
                    type="trigger" :disabled="!editable || saving || deleting"
                    @delete="$delete(automation.data.triggers, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'conditions'" class="automation-conditions">
            <p>{{ $t('automation_settings.conditions_description') }}</p>

            <template v-for="(condition, id) in automation.data.conditions || {}">
                <component
                    v-if="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition) && simple_editor"
                    :is="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition).component"
                    :key="id" :id="id" :condition="condition" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.conditions, id); $forceUpdate()" />

                <json-editor v-else v-model="automation.data.conditions[id]" :key="id" :index="id"
                    :name="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition) &&
                        condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition).name"
                    type="condition" :disabled="!editable || saving || deleting"
                    @delete="$delete(automation.data.conditions, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'actions'" class="automation-actions">
            <template v-for="(action, id) in automation.data.actions || {}">
                <component
                    v-if="action_components.find(c => c.plugin === action.plugin && c.type === action.action) && simple_editor"
                    :is="action_components.find(c => c.plugin === action.plugin && c.type === action.action).component"
                    :key="id" :id="id" :action="action" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.actions, id); $forceUpdate()" />

                <json-editor v-else v-model="automation.data.actions[id]" :key="id" :index="id"
                    :name="action_components.find(c => c.plugin === action.plugin && c.type === action.action) &&
                        action_components.find(c => c.plugin === action.plugin && c.type === action.action).name"
                    type="action" :disabled="!editable || saving || deleting"
                    @delete="$delete(automation.data.actions, id); $forceUpdate()" />
            </template>
        </div>

        <div class="d-flex">
            <div v-if="['triggers', 'conditions', 'actions'].includes(tab)" class="form-group custom-control custom-checkbox mb-0">
                <input v-model="simple_editor" :id="_uid + '-editor'" type="checkbox"
                    class="custom-control-input" />
                <label class="custom-control-label" :for="_uid + '-editor'">
                    {{ $t('automation_settings.editor') }}
                </label>
            </div>

            <dropdown v-if="tab === 'triggers' && editable" :label="$t('automation_settings.add_trigger')"
                type="up" :disabled="saving || deleting"
            >
                <a v-for="{plugin, type, name} in trigger_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addTrigger({plugin, trigger: type})"
                >{{ name }}</a>
                <div v-if="!simple_editor" class="dropdown-divider" />
                <a v-if="!simple_editor" class="dropdown-item" href="#" @click.prevent="addTrigger({plugin: null, trigger: null})">
                    {{ $t('automation_settings.other') }}
                </a>
            </dropdown>

            <dropdown v-if="tab === 'conditions' && editable" :label="$t('automation_settings.add_condition')"
                type="up" :disabled="saving || deleting"
            >
                <a v-for="{plugin, type, name} in condition_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
                >{{ name }}</a>
                <div v-if="!simple_editor" class="dropdown-divider" />
                <a v-if="!simple_editor" class="dropdown-item" href="#" @click.prevent="addCondition({plugin: null, condition: null})">
                    {{ $t('automation_settings.other') }}
                </a>
            </dropdown>

            <dropdown v-if="tab === 'actions' && editable" :label="$t('automation_settings.add_action')"
                type="up" :disabled="saving || deleting"
            >
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addAction({plugin, action: type})"
                >{{ name }}</a>
                <div v-if="!simple_editor" class="dropdown-divider" />
                <a v-if="!simple_editor" class="dropdown-item" href="#" @click.prevent="addAction({plugin: null, action: null})">
                    {{ $t('automation_settings.other') }}
                </a>
            </dropdown>

            <div v-if="saving">{{ $t('automation_settings.saving') }}</div>
            <div class="flex-fill"></div>
            <template v-if="(editable && changed) || !exists">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving || deleting"
                    @click="() => ($emit('reset'), $refs.panel.close())"
                >{{ $t('automation_settings.cancel') }}</button>&nbsp;
                <button v-if="exists && deletable" key="delete" class="btn btn-danger btn-sm" type="button"
                    :disabled="saving || deleting" @click="() => $emit('delete')"
                >{{ $t('automation_settings.delete') }}</button>&nbsp;
                <button v-if="editable" key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="saving || deleting" @click="$emit('save', true)"
                >{{ $t('automation_settings.save') }}</button>
            </template>
            <template v-else>
                <button v-if="exists && deletable" key="delete" class="btn btn-danger btn-sm" type="button"
                    :disabled="saving || deleting" @click="() => $emit('delete')"
                >{{ $t('automation_settings.delete') }}</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="saving || deleting" @click="$refs.panel.close()"
                >{{ $t('automation_settings.done') }}</button>
            </template>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../client/connection';
    import {ClientSymbol, AutomationSymbol} from '../internal-symbols';
    import {StagedAutomation} from '../../client/automation';

    import Panel from '../components/panel.vue';
    import PanelTabs from '../components/panel-tabs.vue';
    import Dropdown from '../components/dropdown.vue';
    import JsonEditor from './json-editor.vue';

    import {
        AutomationTriggerComponents as trigger_components,
        AutomationConditionComponents as condition_components,
        AutomationActionComponents as action_components,
    } from '../component-registry';
    import './triggers';
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
            connection: Connection,
            automation: StagedAutomation,
            exists: Boolean,
            editable: Boolean,
            deletable: Boolean,
            changed: Boolean,
            saving: Boolean,
            deleting: Boolean,
        },
        data() {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const $vm = this;

            return {
                tab: 'general',
                tabs: {
                    general: () => this.$t('automation_settings.general'),
                    triggers: {
                        label: () => this.$t('automation_settings.triggers'),
                        get badge() {
                            return Object.keys($vm.automation.data.triggers || {}).length + '';
                        },
                    },
                    conditions: {
                        label: () => this.$t('automation_settings.conditions'),
                        get badge() {
                            return Object.keys($vm.automation.data.conditions || {}).length + '';
                        },
                    },
                    actions: {
                        label: () => this.$t('automation_settings.actions'),
                        get badge() {
                            return Object.keys($vm.automation.data.actions || {}).length + '';
                        },
                    },
                },

                trigger_components,
                condition_components,
                action_components,

                simple_editor: true,
            };
        },
        inject: {
            client: {from: ClientSymbol},
        },
        provide() {
            return {
                [AutomationSymbol]: this.automation,
            };
        },
        computed: {
            group_names() {
                const group_names = [];

                for (const automation of Object.values(this.client.automations || {})) {
                    if (!automation.data.group_name || group_names.includes(automation.data.group_name)) continue;

                    group_names.push(automation.data.group_name);
                }

                return group_names;
            },
            other_automation_triggers() {
                return Object.values(this.client.automations || {}).filter(other_automation => {
                    if (other_automation.uuid === this.automation.uuid) return false;
                    if (!other_automation.data.actions) return false;

                    return Object.values(other_automation.data.actions).find(action => {
                        if (action.plugin || action.type !== 'RunAutomation') return false;

                        if (action.automation_uuid === this.automation.uuid) return true;
                    });
                });
            },
        },
        methods: {
            addTrigger(data) {
                if (!this.automation.data.triggers) this.$set(this.automation.data, 'triggers', {});

                let id = 0;
                while (this.automation.data.triggers[id]) id++;

                this.$set(this.automation.data.triggers, id, data || {});
                this.$forceUpdate();
            },
            addCondition(data) {
                if (!this.automation.data.conditions) this.$set(this.automation.data, 'conditions', {});

                let id = 0;
                while (this.automation.data.conditions[id]) id++;

                this.$set(this.automation.data.conditions, id, data || {});
                this.$forceUpdate();
            },
            addAction(data) {
                if (!this.automation.data.actions) this.$set(this.automation.data, 'actions', {});

                let id = 0;
                while (this.automation.data.actions[id]) id++;

                this.$set(this.automation.data.actions, id, data || {});
                this.$forceUpdate();
            },
        },
    };
</script>
