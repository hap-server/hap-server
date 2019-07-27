<template>
    <panel ref="panel" class="home-settings" :class="{wide: tab === 'users'}" @close="$emit('close')">
        <panel-tabs v-model="tab" :tabs="tabs" />

        <form v-if="tab === 'general'" @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        placeholder="Home" :disabled="loading || saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-wallpaper'">Wallpaper</label>
                <div class="col-sm-9">
                    <div class="custom-file form-control-sm">
                        <input :id="_uid + '-wallpaper'" ref="file" type="file" class="custom-file-input"
                            :disabled="saving || uploading" @change="upload" />
                        <label class="custom-file-label" :for="_uid + '-wallpaper'">Choose file</label>
                    </div>
                    <div v-if="uploading" class="progress mt-3">
                        <div class="progress-bar" :class="{'progress-bar-striped': typeof upload_progress !== 'number'}"
                            :style="{width: typeof upload_progress !== 'number' ? '100%' : upload_progress * 100 + 'px'}"
                            role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>

                    <input v-if="background_url" :id="_uid + '-wallpaper'" :value="background_url" type="text"
                        class="form-control form-control-sm mt-3" disabled />

                    <img v-if="background_url" class="mt-3" :src="getAssetURL(background_url)"
                        :style="{maxHeight: '300px', maxWidth: '100%'}" />
                </div>
            </div>
        </form>

        <div v-if="tab === 'users'" class="user-management-container mb-3">
            <user-list v-model="editing_user" @create="handler => creating_user = handler" />

            <div v-if="editing_user" ref="user" class="user-management-current-user"
                :class="{scrolled: editing_user_scrolled, 'can-scroll': editing_user_can_scroll}"
                @scroll="onscrollEditingUser"
            >
                <component ref="user-component" :is="editing_user.component"
                    :user-management-handler="editing_user.user_management_handler" :user="editing_user"
                    @changed="c => editing_user_changed = c" @saving="s => editing_user_saving = s"
                >
                    <template v-slot:info="{id, name}">
                        <div class="user-management-info">
                            <div class="user-management-picture" />
                            <h4 class="user-management-name">
                                {{ name || editing_user.name || id || editing_user.id }}
                                <small v-if="name || editing_user.name" class="d-block">
                                    {{ id || editing_user.id }}
                                </small>
                            </h4>
                        </div>
                    </template>

                    <template v-slot:location>
                        <h4>Location</h4>

                        <div class="form-group">
                            <input type="text" class="form-control form-control-sm" disabled />

                            <small class="text-muted">
                                This device will be used to track this user's location for location based automations.
                            </small>
                        </div>
                    </template>

                    <template v-if="canEditUserPermissions" v-slot:permissions="{id}">
                        <user-permissions ref="user-permissions" :id="id || editing_user.id"
                            @changed="c => editing_user_permissions_changed = c"
                            @saving="s => editing_user_permissions_saving = s" />
                    </template>
                </component>
            </div>

            <component v-else-if="creating_user" :is="creating_user.create_component" />
        </div>

        <div v-if="tab === 'accessories'" class="list-group-group">
            <div v-for="group in accessory_groups" :key="group.name" class="list-group-group-item">
                <h4 v-if="group.name">{{ group.name }}</h4>
                <list-group>
                    <list-item v-for="accessory in group.accessories" :key="accessory.uuid"
                        @click="$emit('show-accessory-settings', accessory)"
                    >
                        {{ accessory.name || accessory.uuid }}
                        <small v-if="accessory.name" class="text-muted">{{ accessory.uuid }}</small>

                        <p v-if="accessory.display_services.length" class="mb-0">
                            <small>
                                <template v-for="(service, index) in accessory.display_services">{{ service.name }}{{ accessory.display_services.length - 2 === index ? ' and ' : accessory.display_services.length - 1 > index ? ', ' : '' }}</template>
                            </small>
                        </p>
                    </list-item>
                </list-group>
            </div>
        </div>

        <list-group v-if="tab === 'bridges'" class="mb-3">
            <list-item v-for="bridge_uuid in bridges" :key="bridge_uuid"
                @click="$emit('show-accessory-settings', accessories[bridge_uuid])"
            >
                {{ accessories[bridge_uuid] && accessories[bridge_uuid].name }}
                <small class="text-muted">{{ bridge_uuid }}</small>
            </list-item>
        </list-group>

        <div v-if="tab === 'output'" key="output" class="form-group">
            <dl v-if="command_line_flags.length" class="row">
                <dt class="col-sm-3">Command</dt>
                <dd class="col-sm-9 text-right selectable">
                    <template v-for="arg in command_line_flags">
                        {{ arg.match(/[^\\]\s/g) ? `"${arg}"` : arg }}
                    </template>
                </dd>
            </dl>

            <terminal :terminal="terminal" />
        </div>

        <div v-if="tab === 'console'" key="console" class="form-group">
            <dl v-if="!console" class="row">
                <dt class="col-sm-3">Status</dt>
                <dd class="col-sm-9 text-right">{{ opening_console ? 'Starting' : 'Stopped' }}</dd>
            </dl>

            <terminal :terminal="console_terminal" />
        </div>

        <div class="d-flex">
            <template v-if="tab === 'accessories'">
                <button class="btn btn-default btn-sm" type="button" :disabled="!canAddAccessories"
                    @click="$emit('modal', {type: 'add-accessory'})">Add accessory</button>&nbsp;
            </template>
            <template v-if="tab === 'bridges'">
                <button class="btn btn-default btn-sm" type="button" :disabled="!canCreateBridges"
                    @click="$emit('modal', {type: 'new-bridge'})">New bridge</button>&nbsp;
            </template>
            <div v-if="loading">Loading</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <template v-if="tab === 'accessories'">
                <button class="btn btn-default btn-sm" type="button" :disabled="loadingAccessories"
                    @click="$emit('refresh-accessories')">Refresh accessories</button>&nbsp;
            </template>
            <template v-if="tab === 'general'">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving || uploading"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="loading || saving"
                    @click="save(true)">Save</button>
            </template>
            <template v-else-if="tab === 'users' && editing_user && (editing_user_changed || editing_user_saving)">
                <button class="btn btn-default btn-sm" type="button" :disabled="editing_user_saving"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="editing_user_saving"
                    @click="() => $refs['user-component'].save()">Save</button>
            </template>
            <template v-else-if="tab === 'users' && editing_user &&
                (editing_user_permissions_changed || editing_user_permissions_saving)"
            >
                <button class="btn btn-default btn-sm" type="button" :disabled="editing_user_permissions_saving"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="editing_user_permissions_saving"
                    @click="() => $refs['user-permissions'].save()">Save permissions</button>
            </template>
            <button v-else key="primary" class="btn btn-primary btn-sm" type="button" :disabled="loading || saving"
                @click="() => $refs.panel.close()">Done</button>
        </div>
    </panel>
</template>

<script>
    import axios from 'axios';
    import {Terminal} from 'xterm';

    import Connection from '../../client/connection';
    import {ClientSymbol, GetAssetURLSymbol} from '../internal-symbols';

    import Panel from './panel.vue';
    import PanelTabs from './panel-tabs.vue';
    import TerminalComponent from './terminal.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';
    import UserList from './user-list.vue';
    import UserPermissions from './user-permissions.vue';

    import user_management_components from './user-management';

    export default {
        components: {
            Panel,
            PanelTabs,
            Terminal: TerminalComponent,
            ListGroup,
            ListItem,
            UserList,
            UserPermissions,
        },
        props: {
            connection: Connection,
            accessories: Object,
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
            getAssetURL: {from: GetAssetURLSymbol},
        },
        data() {
            return {
                loading: false,
                saving: false,
                uploading: false,
                upload_progress: null,

                command_line_flags: [],

                tab: 'general',
                tabs: {
                    general: 'General',
                    users: {label: 'Users', if: () => this.canManageUsers && user_management_components.size},
                    accessories: 'Accessories',
                    bridges: 'Bridges',
                    output: {label: 'Output', if: () => this.canAccessServerInfo},
                    console: {label: 'Console', if: () => this.canOpenConsole},
                },

                terminal: null,

                data: null,
                name: null,
                background_url: null,
                bridges: [],

                opening_console: false,
                console: null,
                console_terminal: null,

                editing_user: null,
                creating_user: null,
                editing_user_scrolled: false,
                editing_user_can_scroll: false,
                editing_user_changed: false,
                editing_user_saving: false,
                editing_user_permissions_changed: false,
                editing_user_permissions_saving: false,
            };
        },
        computed: {
            accessory_groups() {
                const groups = {};

                for (const accessory of Object.values(this.accessories)) {
                    const group = groups[accessory.data.room_name] || (groups[accessory.data.room_name] = {
                        name: accessory.data.room_name,
                        accessories: [],
                    });

                    group.accessories.push(accessory);
                }

                return Object.values(groups).sort((a, b) => {
                    if (!a.name && !b.name) return 0;
                    if (!a.name) return 1;
                    if (!b.name) return -1;

                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;

                    return 0;
                });
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
            async connection(connection, old_connection) {
                // eslint-disable-next-line curly
                if (old_connection) old_connection.disableProxyStdout().then(() => {
                    old_connection.removeListener('stdout', this.stdout);
                    old_connection.removeListener('stderr', this.stderr);
                });

                if (connection) {
                    connection.on('stdout', this.stdout);
                    connection.on('stderr', this.stderr);

                    await connection.enableProxyStdout().then(() => this.terminal.write('\nStarted stdout proxy...\n'));
                };

                if (this.console) {
                    this.console.close();
                    this.console = null;
                    this.terminal.setOption('disableStdin', true);
                }

                if (connection && this.tab === 'console') this.openConsole();
            },
            tab(tab) {
                if (tab === 'console' && !this.console && !this.opening_console) {
                    this.openConsole();
                }
            },
            tab() {
                this.name = this.data ? this.data.name : null;
                this.background_url = this.data ? this.data.background_url : null;
                this.editing_user = null;
                this.creating_user = null;
            },
            editing_user(editing_user) {
                this.editing_user_changed = false;
                this.editing_user_saving = false;
                this.editing_user_permissions_changed = false;
                this.editing_user_permissions_saving = false;

                if (editing_user) return this.$nextTick(() => this.onscrollEditingUser({target: this.$refs.user}));

                this.editing_user_scrolled = false;
                this.editing_user_can_scroll = false;
            },
        },
        async created() {
            this.terminal = new Terminal({
                disableStdin: true,
                fontSize: 12,
                convertEol: true,
                columns: 20,
            });
            // this.terminal.open(this.$refs.terminal);
            this.terminal.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ');

            // window.terminal = this.terminal;
            // this.terminal.element.parentElement.removeChild(this.terminal.element);
            // this.$refs.terminal.appendChild(this.terminal.element);

            this.connection.on('stdout', this.stdout);
            this.connection.on('stderr', this.stderr);

            this.console_terminal = new Terminal({
                disableStdin: true,
                fontSize: 12,
                convertEol: true,
                columns: 20,
            });
            this.console_terminal.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ');

            this.console_terminal.onData(data => {
                this.console.write(data);
            });

            await Promise.all([
                this.reload(),
                this.loadCommandLineFlags(),
                this.loadBridges(),
                this.connection.enableProxyStdout().then(() => this.terminal.write('\nStarted stdout proxy...\n')),
            ]);
        },
        destroyed() {
            // this.connection.removeListener('added-bridge', this.addedBridge);
            // this.connection.removeListener('removed-bridge', this.removedBridge);

            return Promise.all([
                this.connection.disableProxyStdout().then(() => {
                    this.connection.removeListener('stdout', this.stdout);
                    this.connection.removeListener('stderr', this.stderr);
                }),
                this.console ? this.console.close() : null,
            ]);
        },
        methods: {
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    const data = await this.connection.getHomeSettings();

                    this.data = data;
                    this.name = data.name;
                    this.background_url = data.background_url;
                } finally {
                    this.loading = false;
                }
            },
            async loadCommandLineFlags() {
                this.command_line_flags = await this.connection.getCommandLineFlags();
            },
            async loadBridges() {
                if (this.loading_bridges) throw new Error('Already loading');
                this.loading_bridges = true;

                try {
                    this.bridges = await this.connection.listBridges();
                } finally {
                    this.loading_bridges = false;
                }
            },
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.data, {
                        name: this.name,
                        background_url: this.background_url,
                    });

                    await this.connection.setHomeSettings(data);
                    this.$emit('updated-settings', data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            async upload() {
                if (this.uploading) throw new Error('Already uploading');
                this.uploading = true;
                this.upload_progress = null;

                try {
                    const form_data = new FormData();
                    form_data.append('background', this.$refs.file.files[0]);

                    const response = await axios.post(this.getAssetURL('upload-layout-background'), form_data, {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                        },
                        onUploadProgress: event => {
                            this.upload_progress = event.loaded / event.total;
                        },
                    });

                    this.background_url = response.data.name;
                } finally {
                    this.uploading = false;
                }
            },
            onscrollEditingUser(event) {
                this.editing_user_scrolled = event.target.scrollTop > 0;
                this.editing_user_can_scroll = event.target.scrollTop <
                    (event.target.scrollHeight - event.target.clientHeight);
            },
            stdout(data) {
                console.log('stdout', data);
                this.terminal.write(data);
            },
            stderr(data) {
                console.error('stderr', data);
                this.terminal.write(data);
            },
            async openConsole() {
                if (this.opening_console) throw new Error('Already opening console');
                this.opening_console = true;

                try {
                    this.console = await this.client.openConsole();

                    if (this._isDestroyed) {
                        await this.console.close();
                        return;
                    }

                    this.console.on('out', data => {
                        this.console_terminal.write(data);
                    });
                    this.console.on('err', data => {
                        this.console_terminal.write(data);
                    });

                    this.console_terminal.setOption('disableStdin', false);
                } finally {
                    this.opening_console = false;
                }
            },
        },
    };
</script>
