<template>
    <panel ref="panel" class="home-settings" @close="$emit('close')">
        <ul class="nav nav-tabs nav-sm mb-3">
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'general'}" href="#" @click.prevent="tab = 'general'">General</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'accessories'}" href="#" @click.prevent="tab = 'accessories'">Accessories</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'bridges'}" href="#" @click.prevent="tab = 'bridges'">Bridges</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'output'}" href="#" @click.prevent="tab = 'output'">Output</a></li>
        </ul>

        <form v-if="tab === 'general'" @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        placeholder="Home" :disabled="loading || saving" />
                </div>
            </div>
        </form>

        <list-group v-if="tab === 'accessories'" class="mb-3">
            <list-item v-for="accessory in Object.values(accessories)" :key="accessory.uuid"
                @click="$emit('show-accessory-settings', accessory)"
            >
                {{ accessory.name }}
                <small class="text-muted">{{ accessory.uuid }}</small>
            </list-item>
        </list-group>

        <list-group v-if="tab === 'bridges'" class="mb-3">
            <list-item v-for="bridge_uuid in bridges" :key="bridge_uuid"
                @click="$emit('show-accessory-settings', accessories[bridge_uuid])"
            >
                {{ accessories[bridge_uuid] && accessories[bridge_uuid].name }}
                <small class="text-muted">{{ bridge_uuid }}</small>
            </list-item>
        </list-group>

        <div v-if="tab === 'output'" class="form-group">
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

        <div class="d-flex">
            <div v-if="loading">Loading</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <template v-if="tab === 'accessories'">
                <button class="btn btn-default btn-sm" type="button" :disabled="loadingAccessories"
                    @click="$emit('refresh-accessories')">Refresh accessories</button>&nbsp;
            </template>
            <template v-if="tab === 'general'">
                <button class="btn btn-default btn-sm" type="button" :disabled="saving"
                    @click="() => $refs.panel.close()">Cancel</button>&nbsp;
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="loading || saving"
                    @click="save(true)">Save</button>
            </template>
            <button v-else key="primary" class="btn btn-primary btn-sm" type="button" :disabled="loading || saving"
                @click="() => $refs.panel.close()">Done</button>
        </div>
    </panel>
</template>

<script>
    import {Terminal} from 'xterm';

    import Connection from '../connection';

    import Panel from './panel.vue';
    import TerminalComponent from './terminal.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';

    export default {
        components: {
            Panel,
            Terminal: TerminalComponent,
            ListGroup,
            ListItem,
        },
        props: {
            connection: Connection,
            accessories: Object,
            loadingAccessories: Boolean,
        },
        data() {
            return {
                loading: false,
                saving: false,

                command_line_flags: [],

                tab: 'general',

                terminal: null,

                data: null,
                name: null,
                bridges: [],
            };
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

            await Promise.all([
                this.reload(),
                this.loadCommandLineFlags(),
                this.loadBridges(),
                this.connection.enableProxyStdout().then(() => this.terminal.write('\nStarted stdout proxy...\n')),
            ]);
        },
        destroy() {
            this.connection.removeListener('added-bridge', this.addedBridge);
            this.connection.removeListener('removed-bridge', this.removedBridge);

            return this.connection.disableProxyStdout().then(() => {
                this.connection.removeListener('stdout', this.stdout);
                this.connection.removeListener('stderr', this.stderr);
            });
        },
        methods: {
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    const data = await this.connection.getHomeSettings();

                    this.data = data;
                    this.name = data.name;
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
                    });

                    await this.connection.setHomeSettings(data);
                    this.$emit('updated-settings', data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            stdout(data) {
                console.log('stdout', data);
                this.terminal.write(data);
            },
            stderr(data) {
                console.error('stderr', data);
                this.terminal.write(data);
            },
        },
    };
</script>
