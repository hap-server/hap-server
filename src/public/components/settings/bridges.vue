<template>
    <div>
        <list-group class="mb-3">
            <list-item v-for="bridge_uuid in bridges.filter(u => client.accessories[u])" :key="bridge_uuid"
                @click="$emit('show-accessory-settings', client.accessories[bridge_uuid])"
            >
                {{ client.accessories[bridge_uuid] && client.accessories[bridge_uuid].name }}
                <small class="text-muted">{{ bridge_uuid }}</small>
            </list-item>
        </list-group>

        <div class="d-flex">
            <button class="btn btn-default btn-sm" type="button" :disabled="!canCreateBridges"
                @click="$emit('show-new-bridge')">{{ $t('settings.new_bridge') }}</button>&nbsp;
            <div v-if="client.loading_accessories || loading_bridges">{{ $t('settings.loading') }}</div>

            <div class="flex-fill"></div>
        </div>
    </div>
</template>

<script>
    import {ClientSymbol} from '../../internal-symbols';

    import ListGroup from '../list-group.vue';
    import ListItem from '../list-item.vue';

    export default {
        components: {
            ListGroup,
            ListItem,
        },
        props: {
            canCreateBridges: Boolean,
        },
        data() {
            return {
                loading_bridges: false,
                bridges: [],
            };
        },
        inject: {
            client: {from: ClientSymbol},
        },
        watch: {
            'client.connection.authenticated_user'(authenticated_user) {
                if (!authenticated_user) return;

                this.loadBridges();
            },
        },
        created() {
            this.client.loadAccessories(this);

            if (this.client.connection && this.client.connection.authenticated_user) {
                this.loadBridges();
            }
        },
        destroyed() {
            this.client.unloadAccessories(this);
        },
        methods: {
            async loadBridges() {
                if (this.loading_bridges) throw new Error('Already loading');
                this.loading_bridges = true;

                try {
                    this.bridges = await this.client.connection.listBridges();
                } finally {
                    this.loading_bridges = false;
                }
            },
        },
    };
</script>
