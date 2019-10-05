<template>
    <div class="automation-trigger">
        <div class="automation-trigger-header">
            <div class="flex-fill">
                <h4 v-if="trigger_component && trigger_component.name">{{ trigger_component.name }}</h4>
                <h4 v-else>{{ $t('automation_settings.trigger_x', {x: id}) }}</h4>
            </div>

            <slot name="header-right" />
            <button v-if="editable" class="btn btn-danger btn-sm ml-3" type="button" :disabled="saving"
                @click="$emit('delete')">{{ $t('automation_settings.remove_trigger') }}</button>
        </div>

        <div class="automation-trigger-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    import {AutomationTriggerComponents as trigger_components} from '../component-registry';

    export default {
        props: {
            id: String,
            trigger: Object,
            editable: Boolean,
            saving: Boolean,
        },
        computed: {
            trigger_component() {
                return trigger_components.find(c => c.plugin === this.trigger.plugin && c.type === this.trigger.trigger);
            },
        },
    };
</script>
