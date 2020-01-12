<template>
    <div @resize="resize"></div>
</template>

<script>
    import {Terminal} from 'xterm';

    export default {
        props: {
            terminal: Terminal,
        },
        mounted() {
            window.addEventListener('resize', this.resize);

            this.terminal.open(this.$el);
            this.resize();
        },
        activated() {
            this.resize();
        },
        destroyed() {
            window.removeEventListener('resize', this.resize);
        },
        methods: {
            resize() {
                const COLUMN_WIDTH = 7;
                const ROW_HEIGHT = 14;

                const cols = Math.floor(this.$el.clientWidth / COLUMN_WIDTH);
                const rows = Math.floor((
                    window.innerHeight - this.$el.offsetParent.offsetTop - this.$el.offsetTop - 48
                ) / ROW_HEIGHT);

                this.terminal.resize(cols, Math.max(rows, 24));
            },
        },
    };
</script>
