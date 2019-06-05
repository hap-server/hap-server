<template>
    <panel class="automation-settings" ref="panel" @close="$emit('close')">
        <panel-tabs v-model="tab" :tabs="tabs" />

        <form v-if="tab === 'general'" @submit.prevent="$emit('save', true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="automation.data.name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>
        </form>

        <div v-if="tab === 'triggers'" class="automation-triggers">
            <p>The automation will run when any of these triggers run.</p>

            <p v-if="other_automation_triggers.length">
                {{ other_automation_triggers.length }} other automation{{ other_automation_triggers.length === 1 ? '' : 's' }}
                will trigger this automation.
            </p>
            <p v-else>Other automations can also trigger this automation.</p>

            <template v-for="(trigger, id) in automation.data.triggers || {}">
                <component
                    v-if="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger)"
                    :is="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger).component"
                    :key="id" :id="id" :trigger="trigger" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.triggers, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'conditions'" class="automation-conditions">
            <p>All of these conditions must be met for the automation's actions to run.</p>

            <template v-for="(condition, id) in automation.data.conditions || {}">
                <component
                    v-if="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition)"
                    :is="condition_components.find(c => c.plugin === condition.plugin && c.type === condition.condition).component"
                    :key="id" :id="id" :condition="condition" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.conditions, id); $forceUpdate()" />
            </template>
        </div>

        <div v-if="tab === 'actions'" class="automation-actions">
            <template v-for="(action, id) in automation.data.actions || {}">
                <component
                    v-if="action_components.find(c => c.plugin === action.plugin && c.type === action.action)"
                    :is="action_components.find(c => c.plugin === action.plugin && c.type === action.action).component"
                    :key="id" :id="id" :action="action" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.actions, id); $forceUpdate()" />
            </template>
        </div>

        <div class="d-flex">
            <dropdown v-if="tab === 'triggers' && editable" label="Add trigger" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in trigger_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addTrigger({plugin, trigger: type})"
                >{{ name }}</a>
            </dropdown>

            <dropdown v-if="tab === 'conditions' && editable" label="Add condition" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in condition_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
                >{{ name }}</a>
            </dropdown>

            <dropdown v-if="tab === 'actions' && editable" label="Add action" type="up" :disabled="saving || deleting">
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addAction({plugin, action: type})"
                >{{ name }}</a>
            </dropdown>

            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="saving || deleting"
                @click="() => ($emit('reset'), $refs.panel.close())">Cancel</button>&nbsp;
            <button v-if="exists && deletable" class="btn btn-danger btn-sm" type="button"
                :disabled="saving || deleting" @click="() => $emit('delete')">Delete</button>&nbsp;
            <button v-if="editable" class="btn btn-primary btn-sm" type="button"
                :disabled="saving || deleting" @click="$emit('save', true)">Save</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import {AutomationsSymbol, AutomationSymbol} from '../internal-symbols';
    import {StagedAutomation} from './automation';

    import Panel from '../components/panel.vue';
    import PanelTabs from '../components/panel-tabs.vue';
    import Dropdown from '../components/dropdown.vue';

    import {trigger_components, condition_components, action_components} from '.';
    import './triggers';
    import './conditions';
    import './actions';

    export default {
        components: {
            Panel,
            PanelTabs,
            Dropdown,
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
            const $vm = this;

            return {
                tab: 'general',
                tabs: {
                    general: 'General',
                    triggers: {label: 'Triggers', get badge() {return Object.keys($vm.automation.data.triggers || {}).length + ''}},
                    conditions: {label: 'Conditions', get badge() {return Object.keys($vm.automation.data.conditions || {}).length + ''}},
                    actions: {label: 'Actions', get badge() {return Object.keys($vm.automation.data.actions || {}).length + ''}},
                },

                trigger_components,
                condition_components,
                action_components,
            };
        },
        inject: {
            automations: {from: AutomationsSymbol},
        },
        provide() {
            return {
                [AutomationSymbol]: this.automation,
            };
        },
        computed: {
            other_automation_triggers() {
                return Object.values(this.automations || {}).filter(other_automation => {
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
