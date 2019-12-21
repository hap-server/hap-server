<template>
    <div v-if="config.type === 'accessory'" class="accessory-configuration">
        <pre><code>{{ JSON.stringify(config, null, 4) }}</code></pre>
    </div>

    <div v-else class="accessory-configuration">
        <p>Unknown accessory type.</p>

        <h4>Configuration</h4>
        <pre><code>{{ JSON.stringify(config, null, 4) }}</code></pre>
    </div>
</template>

<script>
    import Accessory from '../../client/accessory';

    export default {
        props: {
            value: Object,
            accessory: Accessory,
            saving: Boolean,
        },
        data() {
            return {
                valid: false,
            };
        },
        computed: {
            editable() {
                return this.accessory.can_set_config && this.config.is_writable;
            },
            config() {
                return this.value;
            },
        },
        watch: {
            valid(valid) {
                this.$emit('valid', valid);
            },
        },
        created() {
            this.$emit('valid', this.valid);
        },
    };
</script>
