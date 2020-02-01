<template>
    <div class="plugin-management">
        <div class="main">
            <h1>{{ $t('plugins.plugins') }}</h1>
        </div>
    </div>
</template>

<script>
    import Client from '../../client/client';

    export default {
        props: {
            client: Client,
        },
        computed: {
            title() {
                return this.$t('plugins.plugins');
            },

            plugin_name: {
                get() {
                    if (this.$route.name === 'plugin') return this.$route.params.plugin_name;
                    return null;
                },
                set(plugin_name) {
                    if (plugin_name) this.$router.push({name: 'plugin', params: {plugin_name}});
                    else this.$router.push({name: 'plugins'});
                },
            },
        },
        watch: {
            title(title) {
                this.$emit('title', title);
            },
        },
        mounted() {
            this.$emit('title', this.title);
        },
    };
</script>
