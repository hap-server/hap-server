<template>
    <automation-action class="automation-action-run-automation"
        :id="id" :action="action" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <template v-if="!Object.values(client.automations || {}).filter(a => !this_automation || a.uuid !== this_automation.uuid).length">
            <p>{{ $t('automation_actions.run_automation.no_automations') }}</p>
        </template>

        <template v-else>
            <select v-model="action.automation_uuid" class="custom-select custom-select-sm mb-3">
                <option v-for="automation in Object.values(client.automations).filter(a => !this_automation || a.uuid !== this_automation.uuid)"
                    :key="automation.uuid">{{ automation.data.name || automation.uuid }}</option>
            </select>

            <div class="form-group custom-control custom-checkbox">
                <input v-model="action.skip_conditions" :id="_uid + '-skip-conditions'" type="checkbox"
                    class="custom-control-input" />
                <label class="custom-control-label" :for="_uid + '-skip-conditions'">
                    {{ $t('automation_actions.run_automation.skip_conditions') }}
                </label>
            </div>
        </template>
    </automation-action>
</template>

<script>
    import {ClientSymbol, AutomationSymbol} from '../../internal-symbols';

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
            client: {from: ClientSymbol},
            this_automation: {from: AutomationSymbol},
        },
        created() {
            this.client.loadAutomations(this);
        },
        destroyed() {
            this.client.unloadAutomations(this);
        },
    };
</script>
