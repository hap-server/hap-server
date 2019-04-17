<template>
    <div class="settings-wrapper">
        <div class="settings-overlay"></div>

        <div class="settings-window-wrapper">
            <transition @after-leave="$emit('close')">
                <div v-if="show" class="settings-window">
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
    export default {
        data() {
            return {
                show: false,
            };
        },
        mounted() {
            this.show = true;
        },
        methods: {
            close() {
                this.show = false;
            },
        },
    };
</script>
