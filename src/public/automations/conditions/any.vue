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

        <dropdown v-if="editable" slot="header-right" label="Add condition" align="right" :disabled="saving">
            <a v-for="{plugin, type, name} in condition_components" :key="type"
                class="dropdown-item" href="#" @click.prevent="addCondition({plugin, condition: type})"
            >{{ name }}</a>
        </dropdown>
    </automation-condition>
</template>

<script>
    import Dropdown from '../../components/dropdown.vue';

    import AutomationCondition from '../condition.vue';
    import {condition_components} from '..';

    export const type = 'Any';
    export const name = 'Any';

    export default {
        components: {
            Dropdown,
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
