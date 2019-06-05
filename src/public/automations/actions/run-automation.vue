<template>
    <automation-action class="automation-action-run-automation"
        :id="id" :action="action" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <template v-if="!Object.values(automations || {}).filter(a => !this_automation || a.uuid !== this_automation.uuid).length">
            <p>You have no other automations.</p>
        </template>

        <template v-else>
            <select v-model="action.automation_uuid" class="custom-select custom-select-sm mb-3">
                <option v-for="automation in Object.values(automations).filter(a => !this_automation || a.uuid !== this_automation.uuid)"
                    :key="automation.uuid">{{ automation.data.name || automation.uuid }}</option>
            </select>

            <div class="form-group custom-control custom-checkbox">
                <input v-model="action.skip_conditions" :id="_uid + '-skip-conditions'" type="checkbox"
                    class="custom-control-input" />
                <label class="custom-control-label" :for="_uid + '-skip-conditions'">Skip conditions</label>
            </div>
        </template>
    </automation-action>
</template>

<script>
    import {AutomationsSymbol, AutomationSymbol} from '../../internal-symbols';

    import AutomationAction from '../action.vue';

    export const type = 'RunAutomation';
    export const name = 'Run automation';

    export default {
        components: {
            AutomationAction,
        },
        props: {
            id: String,
            action: Object,
            editable: Boolean,
            saving: Boolean,
        },
        inject: {
            automations: {from: AutomationsSymbol},
            this_automation: {from: AutomationSymbol},
        },
    };
</script>
