<template>
    <div :class="['drop' + type, {show: open}]">
        <slot name="button">
            <button :id="_uid + '-dropdown'" ref="toggle" class="btn btn-sm dropdown-toggle" :class="['btn-' + colour]"
                type="button" data-toggle="dropdown" aria-haspopup="true" :aria-expanded="open ? 'true' : 'false'"
                :disabled="disabled" @click.stop="open = !open"
            >
                <slot name="label">{{ label }}</slot>
            </button>
        </slot>

        <div ref="menu" class="dropdown-menu" :class="{show: open, 'dropdown-menu-right': align === 'right'}"
            :aria-labelledby="_uid + '-dropdown'"
        >
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
        props: {
            disabled: {type: Boolean},
            label: {type: String, default: 'Menu'},
            colour: {type: String, validator: value => ['default', 'dark'].includes(value), default: 'default'},
            type: {type: String, validator: value => ['down', 'up', 'left', 'right'].includes(value), default: 'down'},
            align: {type: String, validator: value => ['left', 'right'].includes(value), default: 'left'},
        },
        data() {
            return {
                open: false,
            };
        },
        watch: {
            disabled(disabled) {
                if (disabled) this.open = false;
            },
            open(open) {
                if (open) this.$emit('opened'), document.body.addEventListener('click', this.close, true);
                else this.$emit('closed'), document.body.removeEventListener('click', this.close);
            },
        },
        destroy() {
            document.body.removeEventListener('click', this.close);
        },
        methods: {
            close(event) {
                if (event && event.target === this.$refs.toggle) return;

                this.open = false;
            },
        },
    };
</script>
