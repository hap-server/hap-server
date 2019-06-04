<template>
    <automation-action class="automation-action-conditional"
        :id="id" :condition="condition" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <p>These actions will only run if this condition passes.</p>

        <component
            v-if="action.condition && condition_components.find(c => c.plugin === action.condition.plugin && c.type === action.condition.condition)"
            :is="condition_components.find(c => c.plugin === action.condition.plugin && c.type === action.condition.condition).component"
            :key="id" :id="id" :condition="action.condition" :editable="editable" :saving="saving"
            @delete="action.condition = null; $forceUpdate()" />

        <p v-else>No condition selected.</p>

        <template v-for="(child, id) in action.actions || {}">
            <component
                v-if="action_components.find(c => c.plugin === child.plugin && c.type === child.action)"
                :is="action_components.find(c => c.plugin === child.plugin && c.type === child.action).component"
                :key="id" :id="id" :action="child" :editable="editable" :saving="saving"
                @delete="$delete(action.actions, id); $forceUpdate()" />
        </template>

        <template v-if="editable" slot="header-right">
            <dropdown v-if="!action.condition || !condition_components.find(c => c.plugin === action.condition.plugin && c.type === action.condition.condition)"
                label="Add condition" :disabled="saving"
            >
                <a v-for="{plugin, type, name} in condition_components" :key="type" class="dropdown-item" href="#"
                    @click.prevent="action.condition = {plugin, condition: type}; $forceUpdate()"
                >{{ name }}</a>
            </dropdown>

            <dropdown label="Add action" :disabled="saving">
                <a v-for="{plugin, type, name} in action_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addAction({plugin, action: type})"
                >{{ name }}</a>
            </dropdown>
        </template>
    </automation-action>
</template>

<script>
    import Dropdown from '../../components/dropdown.vue';

    import AutomationAction from '../action.vue';
    import {condition_components, action_components} from '..';

    export const type = 'Conditional';
    export const name = 'Conditional';

    export default {
        components: {
            Dropdown,
            AutomationAction,
        },
        props: {
            id: String,
            action: Object,
            editable: Boolean,
            saving: Boolean,
        },
        data() {
            return {
                condition_components,
                action_components,
            };
        },
        methods: {
            addAction(data) {
                if (!this.action.actions) this.$set(this.action, 'actions', {});

                let id = 0;
                while (this.action.actions[id]) id++;

                this.$set(this.action.actions, id, data || {});
                this.$forceUpdate();
            },
        },
    };
</script>
