<template>
    <panel ref="panel" @close="$emit('close')">
        <form v-if="stage === 'authenticate'" @submit.prevent="authenticate()">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-token'">
                    {{ $t('setup.token') }}
                </label>
                <div class="col-sm-9">
                    <input :id="_uid + '-token'" v-model="setup_token" type="text" class="form-control form-control-sm"
                        :class="{'is-invalid': error}" :disabled="loading" />

                    <div v-if="error" class="invalid-feedback">{{ error.message }}</div>
                </div>
            </div>
        </form>

        <div v-else>
            <p>{{ $t('setup.finished_1') }}</p>
            <p>{{ $t('setup.finished_2') }}</p>
            <p>{{ $t('setup.finished_3') }}</p>
        </div>

        <div class="d-flex">
            <div v-if="loading">{{ $t('setup.loading') }}</div>
            <div class="flex-fill"></div>
            <button v-if="stage === 'authenticate'" class="btn btn-primary btn-sm" type="button" :disabled="loading"
                @click="authenticate()">{{ $t('setup.next') }}</button>
            <button v-else class="btn btn-primary btn-sm" type="button" @click="() => $refs.panel.close()">
                {{ $t('setup.done') }}
            </button>
        </div>
    </panel>
</template>

<script>
    import Connection, {AuthenticatedUser} from '../../client/connection';

    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            queryToken: String,
        },
        data() {
            return {
                stage: 'authenticate',
                loading: false,
                error: null,
                setup_token: '',
            };
        },
        watch: {
            connection(connection) {
                this.stage = 'authenticate';
                if (connection && this.queryToken) {
                    this.setup_token = this.queryToken;
                    this.authenticate();
                } else this.setup_token = null;
            },
            setup_token() {
                this.error = null;
            },
        },
        mounted() {
            if (this.queryToken) {
                this.setup_token = this.queryToken;
                this.authenticate();
            }
        },
        methods: {
            async authenticate() {
                if (this.loading) throw new Error('Already authenticating');
                this.loading = true;

                try {
                    const response = await this.connection.send({
                        type: 'authenticate',
                        setup_token: this.setup_token,
                    });

                    if (response.reject || !response.success) throw new Error(response.data.message || 'Error authenticating');

                    const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

                    Object.defineProperty(authenticated_user, 'token', {value: response.token});
                    Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
                    Object.assign(authenticated_user, response.data);

                    this.connection.authenticated_user = authenticated_user;

                    // Don't save any token to localStorage as this is a temporary user

                    this.stage = 'done';
                } catch (err) {
                    console.error(err);
                    this.error = err;
                } finally {
                    this.loading = false;
                }
            },
        },
    };
</script>
