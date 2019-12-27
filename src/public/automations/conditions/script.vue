<template>
    <automation-condition class="automation-condition-script"
        :id="id" :condition="condition" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <i18n path="automation_conditions.script.description" tag="p">
            <code>true</code>
        </i18n>

        <codemirror v-model="condition.script" :options="options" />
    </automation-condition>
</template>

<script>
    import AutomationCondition from '../condition.vue';

    export const type = 'Script';
    export const name = 'Script';

    export default {
        components: {
            AutomationCondition,
            Codemirror: () => import(/* webpackChunkName: 'codemirror' */ 'codemirror/mode/javascript/javascript')
                .then(() => import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror')).then(c => c.codemirror),
        },
        props: {
            id: String,
            condition: Object,
            editable: Boolean,
            saving: Boolean,
        },
        data() {
            return {
                options: {
                    tabSize: 4,
                    mode: 'text/javascript',
                    theme: 'base16-dark',
                    lineNumbers: true,
                    line: true,
                },
            };
        },
    };
</script>

<style src="codemirror/lib/codemirror.css" />
<style src="codemirror/theme/base16-dark.css" />
