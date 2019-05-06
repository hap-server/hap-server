<template>
    <automation-action class="automation-action-script"
        :id="id" :action="action" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <codemirror v-model="action.script" :options="options" />
    </automation-action>
</template>

<script>
    import AutomationAction from '../action.vue';

    export const type = 'Script';
    export const name = 'Script';

    export default {
        components: {
            AutomationAction,
            Codemirror: () => import(/* webpackChunkName: 'codemirror' */ 'codemirror/mode/javascript/javascript')
                .then(() => import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror')).then(c => c.codemirror),
        },
        props: {
            id: String,
            action: Object,
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
