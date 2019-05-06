<template>
    <automation-condition class="automation-condition-any"
        :id="id" :condition="condition" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <p>One of these conditions must be met for this condition to pass.</p>

        <template v-for="(child, id) in condition.conditions || {}">
            <component
                v-if="condition_components.find(c => c.plugin === child.plugin && c.type === child.condition)"
                :is="condition_components.find(c => c.plugin === child.plugin && c.type === child.condition).component"
                :key="id" :id="id" :condition="child" :editable="editable" :saving="saving"
                @delete="$delete(condition.conditions, id); $forceUpdate()" />
        </template>

        <div v-if="editable" slot="header-right" class="dropdown" :class="{show: add_condition_dropdown_open}">
            <button :id="_uid + '-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" :disabled="saving"
                @click.stop="add_condition_dropdown_open = !add_condition_dropdown_open">Add condition</button>

            <div class="dropdown-menu dropdown-menu-right" :class="{show: add_condition_dropdown_open}"
                :aria-labelledby="_uid + '-dropdown'"
            >
                <a v-for="{plugin, type, name} in condition_components" :key="type"
                    class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
                >{{ name }}</a>
            </div>
        </div>
    </automation-condition>
</template>

<script>
    import AutomationCondition from '../condition.vue';
    import {condition_components} from '..';

    export const type = 'Any';
    export const name = 'Any';

    export default {
        components: {
            AutomationCondition,
        },
        props: {
            id: String,
            condition: Object,
            editable: Boolean,
            saving: Boolean,
        },
        data() {
            return {
                condition_components,
                add_condition_dropdown_open: false,
            };
        },
        methods: {
            addCondition(data) {
                if (!this.condition.conditions) this.$set(this.condition, 'conditions', {});

                let id = 0;
                while (this.condition.conditions[id]) id++;

                this.$set(this.condition.conditions, id, data || {});
                this.$forceUpdate();
            },
        },
    };
</script>
