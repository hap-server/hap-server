<template>
    <div></div>
</template>

<script>
    export default {
        props: ['terminal'],
        mounted() {
            this.terminal.open(this.$el);
        }
    };
</script>
