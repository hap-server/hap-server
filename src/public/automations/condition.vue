<template>
    <div class="automation-condition">
        <div class="automation-condition-header">
            <div class="flex-fill">
                <h4 v-if="condition_component && condition_component.name">{{ condition_component.name }}</h4>
                <h4 v-else>{{ $t('automation_settings.condition_x', {x: id}) }}</h4>
            </div>

            <slot name="header-right" />
            <button v-if="editable" class="btn btn-danger btn-sm ml-3" type="button" :disabled="saving"
                @click="$emit('delete')">{{ $t('automation_settings.remove_condition') }}</button>
        </div>

        <div class="automation-condition-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    import {AutomationConditionComponents as condition_components} from '../component-registry';

    export default {
        props: {
            id: String,
            condition: Object,
            editable: Boolean,
            saving: Boolean,
        },
        computed: {
            condition_component() {
                return condition_components.find(c => c.plugin === this.condition.plugin &&
                    c.type === this.condition.condition);
            },
        },
    };
</script>
