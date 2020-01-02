<template>
    <div v-if="value.type === 'accessory'" class="accessory-configuration">
        <component :is="component" v-if="component" v-model="value" :accessory="accessory" :editable="editable"
            @valid="v => valid = v" />

        <template v-else>
            <codemirror v-model="current_value" class="mb-3" :options="options" @blur="blur" />
            <pre v-if="error" class="text-danger mt-2"><code>{{ error }}</code></pre>
        </template>
    </div>

    <div v-else class="accessory-configuration">
        <p>Unknown accessory type.</p>

        <h4>Configuration</h4>
        <pre><code>{{ JSON.stringify(value, null, 4) }}</code></pre>
    </div>
</template>

<script>
    import Accessory from '../../client/accessory';

    import {AccessoryConfigurationComponents} from '../component-registry';

    export default {
        components: {
            Codemirror: () => import(/* webpackChunkName: 'codemirror' */ 'codemirror/mode/javascript/javascript')
                .then(() => import(/* webpackChunkName: 'codemirror' */ 'vue-codemirror')).then(c => c.codemirror),
        },
        props: {
            value: Object,
            accessory: Accessory,
            saving: Boolean,
        },
        data() {
            return {
                valid: false,
                config: null,
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
        computed: {
            changed() {
                if (!this.value || !this.value.config) return false;
                return !isEqual(this.config, this.value.config);
            },
            editable() {
                return this.accessory.can_set_config && this.config.is_writable;
            },
            json: {
                get() {
                    return JSON.stringify(this.config, null, 4) + '\n';
                },
                set(json) {
                    this.$emit('input', Object.assign({}, this.value, {config: JSON.parse(json)}));
                },
            },
            component() {
                return AccessoryConfigurationComponents.get(JSON.stringify([
                    this.config.plugin || null, this.config.accessory,
                ]));
            },
        },
        watch: {
            valid(valid) {
                this.$emit('valid', valid);
            },
            value(value) {
                this.config = JSON.parse(JSON.stringify(value.config));
            },
            json(new_value) {
                // const new_value = JSON.stringify(value, null, 4) + '\n';
                const current_value = JSON.stringify(JSON.parse(this.current_value), null, 4) + '\n';

                if (new_value !== current_value) {
                    this.current_value = new_value;
                    this.error = null;
                }
            },
            current_value(current_value) {
                if (!this.editable) {
                    this.current_value = JSON.stringify(JSON.parse(this.current_value), null, 4) + '\n';
                    this.error = new Error('This accessory\'s configuration cannot be updated or you don\'t have ' +
                        'permission to update it');
                    return;
                }

                try {
                    const new_value = JSON.parse(current_value);

                    if (new_value.plugin !== this.value.plugin ||
                        new_value.accessory !== this.value.accessory
                    ) {
                        throw new Error('Cannot change plugin/accessory type');
                    }

                    this.json = current_value;
                    this.error = null;
                } catch (err) {
                    this.error = err;
                }
            },
        },
        created() {
            this.config = JSON.parse(JSON.stringify(this.value.config));
            this.$emit('valid', this.valid);
        },
        methods: {
            blur() {
                if (this.current_value.substr(-1) !== '\n') this.current_value += '\n';
            },
        },
    };
</script>
