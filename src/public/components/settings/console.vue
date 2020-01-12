<template>
    <div key="console" class="form-group">
        <dl v-if="!console" class="row">
            <dt class="col-sm-3">{{ $t('settings.status') }}</dt>
            <dd class="col-sm-9 text-right">{{ opening_console ? 'Starting' : 'Stopped' }}</dd>
        </dl>

        <terminal :terminal="terminal" />
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
                terminal: null,
                console: null,
                opening_console: false,
            };
        },
        inject: {
            client: {from: ClientSymbol},
        },
        watch: {
            'client.connection'(connection, old_connection) {
                if (!this.console) return;

                this.console.close();
                this.console = null;
                // this.terminal.setOption('disableStdin', true);
            },
            async 'client.connection.authenticated_user'(authenticated_user) {
                if (!this.client.connection) return;

                this.openConsole();
            },
            console(console, old_console) {
                this.terminal.setOption('disableStdin', !this.console);
            },
        },
        created() {
            this.terminal = new Terminal({
                disableStdin: true,
                fontSize: 12,
                convertEol: true,
                columns: 20,
            });
            this.terminal.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ');

            this.terminal.onData(data => {
                this.console.write(data);
            });

            if (this.client.connection && this.client.connection.authenticated_user) {
                this.openConsole();
            }
        },
        async destroyed() {
            if (this.console) this.console.close();
        },
        methods: {
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
                        this.terminal.write(data);
                    });
                    this.console.on('err', data => {
                        this.terminal.write(data);
                    });
                } finally {
                    this.opening_console = false;
                }
            },
        },
    };
</script>
