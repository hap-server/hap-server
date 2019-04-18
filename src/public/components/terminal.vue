<template>
    <div></div>
</template>

<script>
    import {Terminal} from 'xterm';

    export default {
        props: {
            terminal: Terminal,
        },
        mounted() {
            this.terminal.open(this.$el);
        },
    };
</script>
