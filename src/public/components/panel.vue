<template>
    <div class="settings-wrapper">
        <div class="settings-overlay"></div>

        <div class="settings-window-wrapper">
            <transition @after-leave="$emit('close')">
                <div v-show="!height || (shown && !closed)" ref="window" class="settings-window" :class="{show}"
                    :style="{opacity: height ? '1' : '0', marginTop: '-' + getHeight()}"
                >
                    <slot name="container">
                        <div class="settings-container">
                            <slot />
                        </div>
                    </slot>
                </div>
            </transition>
        </div>
    </div>
</template>

<script>
    import bouncefix from 'bouncefix.js/dist/bouncefix';

    bouncefix.add('settings-window');

    export default {
        data() {
            return {
                show: false,
                shown: false,
                height: null,
                closed: false,
            };
        },
        mounted() {
            this.show = true;
        },
        methods: {
            close() {
                this.show = false;
                this.closed = true;
            },
            getHeight() {
                if (!this.$refs.window) return this.height || 'auto';

                this.$nextTick(() => this.shown = true);

                return this.height = this.$refs.window.clientHeight + 'px';
            },
        },
    };
</script>
