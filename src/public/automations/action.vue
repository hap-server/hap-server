<template>
    <div class="automation-action">
        <div class="automation-action-header">
            <div class="flex-fill">
                <h4 v-if="action_component && action_component.name">{{ action_component.name }}</h4>
                <h4 v-else>{{ $t('automation_settings.action_x', {x: id}) }}</h4>
            </div>

            <slot name="header-right" />
            <button v-if="editable" class="btn btn-danger btn-sm ml-3" type="button" :disabled="saving"
                @click="$emit('delete')">{{ $t('automation_settings.remove_action') }}</button>
        </div>

        <div class="automation-action-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    import {AutomationActionComponents as action_components} from '../component-registry';

    export default {
        props: {
            id: String,
            action: Object,
            editable: Boolean,
            saving: Boolean,
        },
        computed: {
            action_component() {
                return action_components.find(c => c.plugin === this.action.plugin && c.type === this.action.action);
            },
        },
    };
</script>
