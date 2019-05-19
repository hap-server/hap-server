<template>
    <panel class="automation-settings" ref="panel" @close="$emit('close')">
        <ul class="nav nav-tabs nav-sm mb-3">
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'general'}" href="#" @click.prevent="tab = 'general'">General</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'triggers'}" href="#" @click.prevent="tab = 'triggers'">Triggers
                <span v-if="Object.keys(automation.data.triggers || {}).length" class="badge badge-default">
                    {{ Object.keys(automation.data.triggers || {}).length }}</span></a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'conditions'}" href="#" @click.prevent="tab = 'conditions'">Conditions
                <span v-if="Object.keys(automation.data.conditions || {}).length" class="badge badge-default">
                    {{ Object.keys(automation.data.conditions || {}).length }}</span></a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'actions'}" href="#" @click.prevent="tab = 'actions'">Actions
                <span v-if="Object.keys(automation.data.actions || {}).length" class="badge badge-default">
                    {{ Object.keys(automation.data.actions || {}).length }}</span></a></li>
        </ul>

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
            <div v-if="tab === 'triggers' && editable" class="dropdown dropup" :class="{show: add_trigger_dropdown_open}">
                <button :id="_uid + '-triggers-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"
                    :disabled="saving || deleting"
                    @click.stop="add_trigger_dropdown_open = !add_trigger_dropdown_open">Add trigger</button>

                <div class="dropdown-menu" :class="{show: add_trigger_dropdown_open}"
                    :aria-labelledby="_uid + '-triggers-dropdown'"
                >
                    <a v-for="{plugin, type, name} in trigger_components" :key="type"
                        class="dropdown-item" href="#" @click.prevent="addTrigger({plugin, trigger: type})"
                    >{{ name }}</a>
                </div>
            </div>

            <div v-if="tab === 'conditions' && editable" class="dropdown dropup" :class="{show: add_condition_dropdown_open}">
                <button :id="_uid + '-conditions-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"
                    :disabled="saving || deleting"
                    @click.stop="add_condition_dropdown_open = !add_condition_dropdown_open">Add condition</button>

                <div class="dropdown-menu" :class="{show: add_condition_dropdown_open}"
                    :aria-labelledby="_uid + '-conditions-dropdown'"
                >
                    <a v-for="{plugin, type, name} in condition_components" :key="type"
                        class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
                    >{{ name }}</a>
                </div>
            </div>

            <div v-if="tab === 'actions' && editable" class="dropdown dropup" :class="{show: add_action_dropdown_open}">
                <button :id="_uid + '-actions-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"
                    :disabled="saving || deleting"
                    @click.stop="add_action_dropdown_open = !add_action_dropdown_open">Add action</button>

                <div class="dropdown-menu" :class="{show: add_action_dropdown_open}"
                    :aria-labelledby="_uid + '-actions-dropdown'"
                >
                    <a v-for="{plugin, type, name} in action_components" :key="type"
                        class="dropdown-item" href="#" @click.prevent="addAction({plugin, action: type})"
                    >{{ name }}</a>
                </div>
            </div>

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
    import {StagedAutomation} from './automation';

    import Panel from '../components/panel.vue';

    import Trigger from './trigger.vue';

    import {trigger_components, condition_components, action_components} from '.';
    import './triggers';
    import './conditions';
    import './actions';

    export default {
        components: {
            Panel,
            Trigger,
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
            return {
                tab: 'general',

                trigger_components,
                condition_components,
                action_components,
                add_trigger_dropdown_open: false,
                add_condition_dropdown_open: false,
                add_action_dropdown_open: false,
            };
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
