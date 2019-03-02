<template>
    <panel ref="panel" class="home-settings" @close="$emit('close')">
        <ul class="nav nav-tabs nav-sm mb-3">
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'general'}" href="#" @click.prevent="tab = 'general'">General</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'accessories'}" href="#" @click.prevent="tab = 'accessories'">Accessories</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'bridges'}" href="#" @click.prevent="tab = 'bridges'">Bridges</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'output'}" href="#" @click.prevent="tab = 'output'">Output</a></li>
        </ul>

        <div v-if="tab === 'general'" class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
            <div class="col-sm-9">
                <input type="text" class="form-control form-control-sm" :id="_uid + '-name'" v-model="name" placeholder="Home" :disabled="loading || saving" />
            </div>
        </div>

        <list-group v-if="tab === 'accessories'" class="mb-3">
            <list-item v-for="accessory in Object.values(accessories)" :key="accessory.uuid" @click="$emit('show-accessory-settings', accessory)">
                {{ accessory.name }}
                <small class="text-muted">{{ accessory.uuid }}</small>
            </list-item>
        </list-group>

        <list-group v-if="tab === 'bridges'" class="mb-3">
            <list-item v-for="bridge_uuid in bridges" :key="bridge_uuid" @click="$emit('show-accessory-settings', accessories[bridge_uuid])">
                {{ accessories[bridge_uuid] && accessories[bridge_uuid].name }}
                <small class="text-muted">{{ bridge_uuid }}</small>
            </list-item>
        </list-group>

        <div v-if="tab === 'output'" class="form-group">
            <terminal :terminal="terminal" />
        </div>

        <div class="d-flex">
            <div v-if="loading">Loading</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" @click="() => $refs.panel.close()" :disabled="saving">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button" @click="save(true)" :disabled="loading || saving">Save</button>
        </div>
    </panel>
</template>

<script>
    import {Terminal} from 'xterm';

    import Panel from './panel.vue';
    import TerminalComponent from './terminal.vue';
    import ListGroup from './list-group.vue';
    import ListItem from './list-item.vue';

    export default {
        props: ['connection', 'accessories'],
        data() {
            return {
                loading: false,
                saving: false,

                tab: 'general',

                terminal: null,

                name: null,
                bridges: [],
            };
        },
        components: {
            Panel,
            Terminal: TerminalComponent,
            ListGroup,
            ListItem,
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

                    this.name = data.name;
                } finally {
                    this.loading = false;
                }
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
                    const data = {
                        name: this.name,
                    };

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
            }
        }
    };
</script>
