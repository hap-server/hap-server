<template>
    <div class="form-group">
        <dl v-if="command_line_flags.length" class="row">
            <dt class="col-sm-3">{{ $t('settings.command') }}</dt>
            <dd class="col-sm-9 text-right selectable">
                <template v-for="arg in command_line_flags">
                    {{ arg.match(/[^\\]\s/g) ? `"${arg}"` : arg }}
                </template>
            </dd>
        </dl>

        <terminal ref="terminal" :terminal="terminal" />
    </div>
</template>

<script>
    import {ClientSymbol} from '../../internal-symbols';

    import {Terminal} from 'xterm';

    import TerminalComponent from '../terminal.vue';

    export default {
        components: {
            Terminal: TerminalComponent,
        },
        data() {
            return {
                command_line_flags: [],
                terminal: null,
            };
        },
        inject: {
            client: {from: ClientSymbol},
        },
        watch: {
            'client.connection'(connection, old_connection) {
                // eslint-disable-next-line curly
                if (old_connection) {
                    old_connection.removeListener('stdout', this.stdout);
                    old_connection.removeListener('stderr', this.stderr);
                    old_connection.disableProxyStdout();
                }

                if (connection) {
                    connection.on('stdout', this.stdout);
                    connection.on('stderr', this.stderr);
                }
            },
            async 'client.connection.authenticated_user'(authenticated_user) {
                if (!this.client.connection) return;

                await Promise.all([
                    this.loadCommandLineFlags(),
                    this.client.connection.enableProxyStdout()
                        .then(() => this.terminal.write('\nStarted stdout proxy...\n')),
                ]);
            },
        },
        created() {
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

            if (this.client.connection) this.client.connection.on('stdout', this.stdout);
            if (this.client.connection) this.client.connection.on('stderr', this.stderr);

            if (this.client.connection && this.client.connection.authenticated_user) {
                Promise.all([
                    this.loadCommandLineFlags(),
                    this.client.connection.enableProxyStdout()
                        .then(() => this.terminal.write('\nStarted stdout proxy...\n')),
                ]);
            }
        },
        updated() {
            this.$refs.terminal.resize();
        },
        async destroyed() {
            if (!this.client.connection) return;

            await this.client.connection.disableProxyStdout().then(() => {
                this.client.connection.removeListener('stdout', this.stdout);
                this.client.connection.removeListener('stderr', this.stderr);
            });
        },
        methods: {
            async loadCommandLineFlags() {
                this.command_line_flags = await this.client.connection.getCommandLineFlags();
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
