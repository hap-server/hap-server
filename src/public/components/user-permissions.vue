<template>
    <form class="user-permissions" @submit="save(true)">
        <h4>{{ $t('settings.permissions.permissions') }}</h4>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input :id="_uid + '-admin'" v-model="admin" type="checkbox" class="custom-control-input"
                    :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-admin'">
                    {{ $t('settings.permissions.admin') }}
                </label>
            </div>
            <small v-if="admin" class="text-warning">
                {{ $t('settings.permissions.admin_warning') }}
            </small>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin || set_home_settings" :id="_uid + '-get-home-settings'"
                    :checked="true" type="checkbox" class="custom-control-input" disabled />
                <input v-else :id="_uid + '-get-home-settings'" v-model="get_home_settings" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving || admin" />
                <label class="custom-control-label" :for="_uid + '-get-home-settings'">
                    {{ $t('settings.permissions.get_home_settings') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-set-home-settings'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-set-home-settings'" v-model="set_home_settings" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-set-home-settings'">
                    {{ $t('settings.permissions.set_home_settings') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-server-runtime-info'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-server-runtime-info'" v-model="server_runtime_info" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-server-runtime-info'">
                    {{ $t('settings.permissions.server_runtime_info') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-web-console'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-web-console'" v-model="web_console" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-web-console'">
                    {{ $t('settings.permissions.web_console') }}
                </label>
            </div>
            <small v-if="!admin && web_console" class="text-danger">
                {{ $t('settings.permissions.web_console_warning') }}
            </small>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin || manage_permissions" :id="_uid + '-manage-users'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-manage-users'" v-model="manage_users" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-manage-users'">
                    {{ $t('settings.permissions.manage_users') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-manage-permissions'" :checked="true" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving || admin" />
                <input v-else :id="_uid + '-manage-permissions'" v-model="manage_permissions" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-manage-permissions'">
                    {{ $t('settings.permissions.manage_permissions') }}
                </label>
            </div>
            <small v-if="!admin && manage_permissions" class="text-danger">
                {{ $t('settings.permissions.manage_permissions_warning') }}
            </small>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-manage-pairings'" :checked="true" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving || admin" />
                <input v-else :id="_uid + '-manage-pairings'" v-model="manage_pairings" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-manage-pairings'">
                    {{ $t('settings.permissions.manage_pairings') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-create-accessories'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-create-accessories'" v-model="create_accessories" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-create-accessories'">
                    {{ $t('settings.permissions.create_accessories') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-create-layouts'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-create-layouts'" v-model="create_layouts" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-create-layouts'">
                    {{ $t('settings.permissions.create_layouts') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-create-automations'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-create-automations'" v-model="create_automations" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-create-automations'">
                    {{ $t('settings.permissions.create_automations') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-create-scenes'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-create-scenes'" v-model="create_scenes" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-create-scenes'">
                    {{ $t('settings.permissions.create_scenes') }}
                </label>
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input v-if="admin" :id="_uid + '-create-bridges'" :checked="true" type="checkbox"
                    class="custom-control-input" disabled />
                <input v-else :id="_uid + '-create-bridges'" v-model="create_bridges" type="checkbox"
                    class="custom-control-input" :disabled="loading || saving" />
                <label class="custom-control-label" :for="_uid + '-create-bridges'">
                    {{ $t('settings.permissions.create_bridges') }}
                </label>
            </div>
        </div>

        <h5 class="d-flex">
            <span class="flex-fill">{{ $t('settings.permissions.accessories_bridges') }}</span>
            <dropdown v-if="Object.values(client.accessories).find(a => !accessories[a.uuid])" class="ml-3"
                colour="dark" :label="$t('settings.permissions.add')" align="right"
                :disabled="loading || saving || admin"
            >
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <a v-for="accessory in client.accessories" :key="accessory.uuid" v-if="!accessories[accessory.uuid]"
                    class="dropdown-item" href="#"
                    @click.prevent="$set(accessories, accessory.uuid, JSON.parse(JSON.stringify(accessories['*'])))"
                >
                    {{ accessory.name || accessory.uuid }}
                </a>
            </dropdown>
        </h5>
        <div class="table-responsive">
            <table class="table user-permissions-overrides">
                <thead>
                    <tr>
                        <th></th>
                        <th>{{ $t('settings.permissions.read') }}</th>
                        <th>{{ $t('settings.permissions.write') }}</th>
                        <th>{{ $t('settings.permissions.manage') }}</th>
                        <th>{{ $t('settings.permissions.configure') }}</th>
                        <th>{{ $t('settings.permissions.delete') }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(permissions, accessory_uuid) in accessories" :key="accessory_uuid">
                        <td :class="{'text-muted': accessory_uuid === '*'}">
                            {{ accessory_uuid === '*' ? $t('settings.permissions.default') : client.accessories &&
                                client.accessories[accessory_uuid] && client.accessories[accessory_uuid].name ||
                                accessory_uuid }}
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="accessories[accessory_uuid].get" type="checkbox"
                                :disabled="loading || saving || accessories[accessory_uuid].set ||
                                    accessories[accessory_uuid].manage || accessories[accessory_uuid].config ||
                                    accessories[accessory_uuid].delete" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="accessories[accessory_uuid].set" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="accessories[accessory_uuid].manage" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="accessories[accessory_uuid].config" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="accessories[accessory_uuid].delete" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <button v-if="accessory_uuid !== '*'" class="btn btn-danger btn-sm"
                                :disabled="loading || saving || admin"
                                @click.stop="$delete(accessories, accessory_uuid)"
                            >{{ $t('settings.permissions.remove') }}</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <h5 class="d-flex">
            <span class="flex-fill">{{ $t('settings.permissions.layouts') }}</span>
            <dropdown v-if="Object.values(client.layouts).find(l => !layouts[l.uuid])" class="ml-3" colour="dark"
                :label="$t('settings.permissions.add')" align="right" :disabled="loading || saving || admin"
            >
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <a v-for="layout in client.layouts" v-if="!layouts[layout.uuid] && !layout.uuid.startsWith('Overview.')"
                    :key="layout.uuid" class="dropdown-item" href="#"
                    @click.prevent="$set(layouts, layout.uuid, JSON.parse(JSON.stringify(layouts['*'])))"
                >
                    {{ layout.name || layout.uuid }}
                </a>
            </dropdown>
        </h5>
        <div class="table-responsive">
            <table class="table user-permissions-overrides">
                <thead>
                    <tr>
                        <th></th>
                        <th>{{ $t('settings.permissions.view') }}</th>
                        <th>{{ $t('settings.permissions.edit') }}</th>
                        <th>{{ $t('settings.permissions.delete') }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(permissions, layout_uuid) in layouts" :key="layout_uuid">
                        <td :class="{'text-muted': layout_uuid === '*'}">
                            {{ layout_uuid === '*' ? $t('settings.permissions.default') : client.layouts &&
                                client.layouts[layout_uuid] && client.layouts[layout_uuid].data.name || layout_uuid }}
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="layouts[layout_uuid].get" type="checkbox"
                                :disabled="loading || saving || layouts[layout_uuid].set ||
                                    layouts[layout_uuid].delete" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="layouts[layout_uuid].set" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="layouts[layout_uuid].delete" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <button v-if="layout_uuid !== '*'" class="btn btn-danger btn-sm"
                                :disabled="loading || saving || admin"
                                @click.stop="$delete(layouts, layout_uuid)"
                            >{{ $t('settings.permissions.remove') }}</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <h5 class="d-flex">
            <span class="flex-fill">{{ $t('settings.permissions.scenes') }}</span>
            <dropdown v-if="Object.values(client.scenes).find(s => !scenes[s.uuid])" class="ml-3" colour="dark"
                :label="$t('settings.permissions.add')" align="right" :disabled="loading || saving || admin"
            >
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <a v-for="scene in client.scenes" :key="scene.uuid" v-if="!scenes[scene.uuid]" class="dropdown-item"
                    href="#" @click.prevent="$set(scenes, scene.uuid, JSON.parse(JSON.stringify(scenes['*'])))"
                >
                    {{ scene.data.name || scene.uuid }}
                </a>
            </dropdown>
        </h5>
        <div class="table-responsive">
            <table class="table user-permissions-overrides">
                <thead>
                    <tr>
                        <th></th>
                        <th>{{ $t('settings.permissions.view') }}</th>
                        <th>{{ $t('settings.permissions.activate') }}</th>
                        <th>{{ $t('settings.permissions.edit') }}</th>
                        <th>{{ $t('settings.permissions.delete') }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(permissions, scene_uuid) in scenes" :key="scene_uuid">
                        <td :class="{'text-muted': scene_uuid === '*'}">
                            {{ scene_uuid === '*' ? $t('settings.permissions.default') : client.scenes &&
                                client.scenes[scene_uuid] && client.scenes[scene_uuid].data.name || scene_uuid }}
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="scenes[scene_uuid].get" type="checkbox"
                                :disabled="loading || saving || scenes[scene_uuid].activate ||
                                    scenes[scene_uuid].set || scenes[scene_uuid].delete" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="scenes[scene_uuid].activate" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="scenes[scene_uuid].set" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <input v-if="admin" type="checkbox" :checked="true" disabled />
                            <input v-else v-model="scenes[scene_uuid].delete" type="checkbox"
                                :disabled="loading || saving" />
                        </td>
                        <td>
                            <button v-if="scene_uuid !== '*'" class="btn btn-danger btn-sm"
                                :disabled="loading || saving || admin"
                                @click.stop="$delete(scenes, scene_uuid)"
                            >{{ $t('settings.permissions.remove') }}</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </form>
</template>

<script>
    import {ClientSymbol} from '../internal-symbols';
    import Dropdown from './dropdown.vue';

    export default {
        components: {
            Dropdown,
        },
        props: {
            id: String,
        },
        inject: {
            client: {from: ClientSymbol},
        },
        data() {
            return {
                loading: false,
                saving: false,

                saved_permissions: null,

                admin: false,

                get_home_settings: false,
                set_home_settings: false,
                server_runtime_info: false,
                web_console: false,
                manage_users: false,
                manage_permissions: false,
                manage_pairings: false,

                create_accessories: false,
                create_layouts: false,
                create_automations: false,
                create_scenes: false,
                create_bridges: false,

                accessories: {'*': {}},
                layouts: {'*': {}},
                automations: {'*': {}},
                scenes: {'*': {}},
            };
        },
        computed: {
            changed() {
                if (!this.saved_permissions) return false;

                if (this.admin != !!this.saved_permissions['*']) return true;

                if (this.get_home_settings != !!this.saved_permissions.get_home_settings) return true;
                if (this.set_home_settings != !!this.saved_permissions.set_home_settings) return true;
                if (this.server_runtime_info != !!this.saved_permissions.server_runtime_info) return true;
                if (this.web_console != !!this.saved_permissions.web_console) return true;
                if (this.manage_users != !!this.saved_permissions.manage_users) return true;
                if (this.manage_permissions != !!this.saved_permissions.manage_permissions) return true;
                if (this.manage_pairings != !!this.saved_permissions.manage_pairings) return true;

                if (this.create_accessories != !!this.saved_permissions.create_accessories) return true;
                if (this.create_layouts != !!this.saved_permissions.create_layouts) return true;
                if (this.create_automations != !!this.saved_permissions.create_automations) return true;
                if (this.create_scenes != !!this.saved_permissions.create_scenes) return true;
                if (this.create_bridges != !!this.saved_permissions.create_bridges) return true;

                for (const key of Object.keys(this.accessories)) {
                    const permissions = this.accessories[key] || this.accessories['*'] || {};
                    const saved = this.saved_permissions.accessories && (this.saved_permissions.accessories[key] ||
                        this.saved_permissions.accessories['*']) || this.accessories['*'] || {};

                    if (!permissions || !saved) return true;
                    if (!!permissions.get != !!saved.get) return true;
                    if (!!permissions.set != !!saved.set) return true;
                    if (!!permissions.manage != !!saved.manage) return true;
                    if (!!permissions.config != !!saved.config) return true;
                    if (!!permissions.delete != !!saved.delete) return true;
                }

                for (const key of Object.keys(this.layouts)) {
                    const permissions = this.layouts[key] || this.layouts['*'] || {};
                    const saved = this.saved_permissions.layouts && (this.saved_permissions.layouts[key] ||
                        this.saved_permissions.layouts['*']) || this.layouts['*'] || {};

                    if (!permissions || !saved) return true;
                    if (!!permissions.get != !!saved.get) return true;
                    if (!!permissions.set != !!saved.set) return true;
                    if (!!permissions.delete != !!saved.delete) return true;
                }

                for (const key of Object.keys(this.automations)) {
                    const permissions = this.automations[key] || this.automations['*'] || {};
                    const saved = this.saved_permissions.automations && (this.saved_permissions.automations[key] ||
                        this.saved_permissions.automations['*']) || this.automations['*'] || {};

                    if (!permissions || !saved) return true;
                    if (!!permissions.get != !!saved.get) return true;
                    if (!!permissions.set != !!saved.set) return true;
                    if (!!permissions.delete != !!saved.delete) return true;
                }

                for (const key of Object.keys(this.scenes)) {
                    const permissions = this.scenes[key] || this.scenes['*'] || {};
                    const saved = this.saved_permissions.scenes && (this.saved_permissions.scenes[key] ||
                        this.saved_permissions.scenes['*']) || this.scenes['*'] || {};

                    if (!permissions || !saved) return true;
                    if (!!permissions.get != !!saved.get) return true;
                    if (!!permissions.set != !!saved.set) return true;
                    if (!!permissions.delete != !!saved.delete) return true;
                }

                return false;
            },
        },
        watch: {
            changed(changed) {
                this.$emit('changed', changed);
            },
            saving(saving) {
                this.$emit('saving', saving);
            },
            'client.connection'(connection) {
                if (connection) this.reload();
            },
            id() {
                this.saved_permissions = null;
                if (this.client.connection) this.reload();
            },
            saved_permissions(saved) {
                this.admin = saved && !!saved['*'];

                this.get_home_settings = saved && !!saved.get_home_settings;
                this.set_home_settings = saved && !!saved.set_home_settings;
                this.server_runtime_info = saved && !!saved.server_runtime_info;
                this.web_console = saved && !!saved.web_console;
                this.manage_users = saved && !!saved.manage_users;
                this.manage_permissions = saved && !!saved.manage_permissions;
                this.manage_pairings = saved && !!saved.manage_pairings;

                this.create_accessories = saved && !!saved.create_accessories;
                this.create_layouts = saved && !!saved.create_layouts;
                this.create_automations = saved && !!saved.create_automations;
                this.create_scenes = saved && !!saved.create_scenes;
                this.create_bridges = saved && !!saved.create_bridges;

                for (const k of ['accessories', 'layouts', 'automations', 'scenes']) {
                    this[k] = JSON.parse(JSON.stringify((saved && saved[k]) || {}));
                    if (!this[k]['*']) this.$set(this[k], '*', {});
                }
            },
        },
        created() {
            this.reload();
        },
        methods: {
            getAccessoryName(uuid) {
                if (uuid === '*') return this.$t('settings.permissions.default');

                const accessory = this.client.accessories[uuid];
                if (!accessory) return this.$t('settings.permissions.unknown_accessory', {uuid});

                return accessory.name || accessory.uuid;
            },
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    this.saved_permissions = (await this.client.connection.getUsersPermissions(this.id))[0] || {};
                } finally {
                    this.loading = false;
                }
            },
            async save() {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const permissions = Object.assign({}, this.saved_permissions, {
                        '*': this.admin,

                        get_home_settings: this.get_home_settings,
                        set_home_settings: this.set_home_settings,
                        server_runtime_info: this.server_runtime_info,
                        web_console: this.web_console,
                        manage_users: this.manage_users,
                        manage_permissions: this.manage_permissions,
                        manage_pairings: this.manage_pairings,

                        create_accessories: this.create_accessories,
                        create_layouts: this.create_layouts,
                        create_automations: this.create_automations,
                        create_scenes: this.create_scenes,
                        create_bridges: this.create_bridges,
                    });

                    for (const k of ['accessories', 'layouts', 'automations', 'scenes']) {
                        permissions[k] = JSON.parse(JSON.stringify((this && this[k]) || {}));
                    }

                    await this.client.connection.setUserPermissions(this.id, permissions);
                    this.saved_permissions = permissions;
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
