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
            <div v-if="!action.condition || !condition_components.find(c => c.plugin === action.condition.plugin && c.type === action.condition.condition)"
                class="dropdown" :class="{show: add_condition_dropdown_open}"
            >
                <button :id="_uid + '-conditions-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" :disabled="saving"
                    @click.stop="add_condition_dropdown_open = !add_condition_dropdown_open">Add condition</button>

                <div class="dropdown-menu" :class="{show: add_condition_dropdown_open}"
                    :aria-labelledby="_uid + '-conditions-dropdown'"
                >
                    <a v-for="{plugin, type, name} in condition_components" :key="type" class="dropdown-item" href="#"
                        @click.prevent="action.condition = {plugin, condition: type}; $forceUpdate()"
                    >{{ name }}</a>
                </div>
            </div>

            <div class="dropdown" :class="{show: add_action_dropdown_open}">
                <button :id="_uid + '-actions-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" :disabled="saving"
                    @click.stop="add_action_dropdown_open = !add_action_dropdown_open">Add action</button>

                <div class="dropdown-menu dropdown-menu-right" :class="{show: add_action_dropdown_open}"
                    :aria-labelledby="_uid + '-actions-dropdown'"
                >
                    <a v-for="{plugin, type, name} in action_components" :key="type"
                        class="dropdown-item" href="#" @click.prevent="addAction({plugin, action: type})"
                    >{{ name }}</a>
                </div>
            </div>
        </template>
    </automation-action>
</template>

<script>
    import AutomationAction from '../action.vue';
    import {condition_components, action_components} from '..';

    export const type = 'Conditional';
    export const name = 'Conditional';

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
        data() {
            return {
                condition_components,
                action_components,
                add_condition_dropdown_open: false,
                add_action_dropdown_open: false,
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
