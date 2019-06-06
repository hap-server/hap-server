<template>
    <div class="automation-json-editor">
        <div class="automation-json-editor-header">
            <div class="flex-fill">
                <h4 v-if="name">{{ name }}</h4>
                <h4 v-else>{{ type.substr(0, 1).toUpperCase() + type.substr(1) }} #{{ index }}</h4>
            </div>

            <button v-if="$listeners.delete" class="btn btn-danger btn-sm ml-3" type="button" :disabled="disabled"
                @click="$emit('delete')">Remove {{ type }}</button>
        </div>

        <div class="automation-json-editor-contents">
            <codemirror v-model="current_value" :options="options" @blur="blur" />

            <pre v-if="error" class="text-danger mt-2"><code>{{ error }}</code></pre>
        </div>
    </div>
</template>

<script>
    export default {
        components: {
            Codemirror: () => import(/* webpackChunkName: 'codemirror' */ 'codemirror/mode/javascript/javascript')
                .then(() => import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror')).then(c => c.codemirror),
        },
        props: {
            index: String,
            name: String,
            value: {},
            type: {type: String, validator: value => ['trigger', 'condition', 'action'].includes(value)},
            disabled: Boolean,
        },
        data() {
            return {
                current_value: null,
                error: null,
                options: {
                    tabSize: 4,
                    mode: 'application/json',
                    theme: 'base16-dark',
                    lineNumbers: true,
                    line: true,
                },
            };
        },
        watch: {
            value: {
                handler(value) {
                    const new_value = JSON.stringify(value, null, 4) + '\n';
                    const current_value = JSON.stringify(JSON.parse(this.current_value), null, 4) + '\n';

                    if (new_value !== current_value) {
                        this.current_value = new_value;
                        this.error = null;
                    }

                    try {
                        if (value.plugin && value.plugin !== 'string') throw new Error('Invalid plugin');
                        if (!value[this.type] || typeof value[this.type] !== 'string') throw new Error('Invalid type');
                    } catch (err) {
                        this.error = err;
                    }
                },
                immediate: true,
            },
            current_value(current_value) {
                try {
                    const new_value = JSON.parse(current_value);

                    if (new_value.plugin && new_value.plugin !== 'string') throw new Error('Invalid plugin');
                    if (!new_value[this.type] || typeof new_value[this.type] !== 'string') throw new Error('Invalid type');

                    this.error = null;
                    this.$emit('input', new_value);
                } catch (err) {
                    this.error = err;
                }
            },
        },
        methods: {
            blur() {
                if (this.current_value.substr(-1) !== '\n') this.current_value += '\n';
            },
        },
    };
</script>

<style src="codemirror/lib/codemirror.css" />
<style src="codemirror/theme/base16-dark.css" />
