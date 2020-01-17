<template>
    <panel ref="panel" class="home-settings wide" no-frame @close="$emit('close')">
        <div class="d-sm-flex">
            <keep-alive>
                <status v-if="canAccessServerInfo" ref="status" />
            </keep-alive>
            <div class="flex-fill">
                <panel-tabs v-model="tab" :tabs="tabs" />

                <keep-alive>
                    <general v-if="tab === 'general'" ref="general" />
                </keep-alive>
                <keep-alive>
                    <users v-if="tab === 'users'" ref="users"
                        :can-edit-user-permissions="canEditUserPermissions" />
                </keep-alive>
                <keep-alive>
                    <accessories v-if="tab === 'accessories'" ref="accessories"
                        :can-add-accessories="canAddAccessories"
                        @show-accessory-settings="a => $emit('show-accessory-settings', a)"
                        @show-add-accessory="$emit('modal', {type: 'add-accessory'})" />
                </keep-alive>
                <keep-alive>
                    <bridges v-if="tab === 'bridges'" ref="bridges"
                        :can-create-bridges="canCreateBridges"
                        @show-accessory-settings="a => $emit('show-accessory-settings', a)"
                        @show-new-bridge="$emit('modal', {type: 'new-bridge'})" />
                </keep-alive>
                <keep-alive v-if="canAccessServerInfo">
                    <server-output v-if="tab === 'output'" ref="output" />
                </keep-alive>
                <keep-alive v-if="canOpenConsole">
                    <console v-if="tab === 'console'" ref="console" />
                </keep-alive>
            </div>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../client/connection';
    import {ClientSymbol} from '../internal-symbols';

    import {UserManagementHandlers as user_management_components} from '../component-registry';

    import Panel from './panel.vue';
    import PanelTabs from './panel-tabs.vue';

    import Status from './settings/status.vue';
    import General from './settings/general.vue';
    import Users from './settings/users.vue';
    import Accessories from './settings/accessories.vue';
    import Bridges from './settings/bridges.vue';
    import ServerOutput from './settings/server-output.vue';
    import Console from './settings/console.vue';

    export default {
        components: {
            Panel,
            PanelTabs,

            Status,
            General,
            Users,
            Accessories,
            Bridges,
            ServerOutput,
            Console,
        },
        props: {
            loadingAccessories: Boolean,
            canAddAccessories: Boolean,
            canCreateBridges: Boolean,
            canOpenConsole: Boolean,
            canManageUsers: Boolean,
            canAccessServerInfo: Boolean,
            canEditUserPermissions: Boolean,
        },
        inject: {
            client: {from: ClientSymbol},
        },
        data() {
            return {
                tab_: 'general',
                tabs: {
                    general: () => this.$t('settings.general'),
                    users: {label: () => this.$t('settings.users'), if: () => this.canManageUsers &&
                        user_management_components.size},
                    accessories: () => this.$t('settings.accessories'),
                    bridges: () => this.$t('settings.bridges'),
                    output: {label: () => this.$t('settings.output'), if: () => this.canAccessServerInfo},
                    console: {label: () => this.$t('settings.console'), if: () => this.canOpenConsole},
                },
            };
        },
        computed: {
            tab: {
                get() {
                    if (this.$route.name === 'settings') return this.$route.query.tab || 'general';
                    return this.tab_;
                },
                set(tab) {
                    if (this.$route.name === 'settings') {
                        this.$router.replace({name: 'settings', query: {tab}});
                    }

                    this.tab_ = tab;
                },
            },

            loading() {
                return this.$refs.general && this.$refs.general.loading;
            },
            saving() {
                return this.$refs.general && this.$refs.general.saving;
            },
            uploading() {
                return this.$refs.general && this.$refs.general.uploading;
            },
            changed() {
                return this.$refs.general && this.$refs.general.changed;
            },

            editing_user() {
                return this.$refs.users && this.$refs.users.editing_user;
            },
            editing_user_changed() {
                return this.$refs.users && this.$refs.users.editing_user_changed;
            },
            editing_user_saving() {
                return this.$refs.users && this.$refs.users.editing_user_saving;
            },
            editing_user_permissions_changed() {
                return this.$refs.users && this.$refs.users.editing_user_permissions_changed;
            },
            editing_user_permissions_saving() {
                return this.$refs.users && this.$refs.users.editing_user_permissions_saving;
            },

            close_with_escape_key() {
                if (this.tab === 'general') return !this.saving && !this.uploading;
                if (this.tab === 'users' && this.editing_user &&
                    (this.editing_user_changed || this.editing_user_saving)) return !this.editing_user_saving;
                if (this.tab === 'users' && this.editing_user &&
                    (this.editing_user_permissions_changed || this.editing_user_permissions_saving)
                ) return !this.editing_user_permissions_saving;
                return !this.loading && !this.saving;
            },
        },
        watch: {
            tab() {
                if (this.$refs.users) this.$refs.users.creating_user = null;
            },
        },
    };
</script>
