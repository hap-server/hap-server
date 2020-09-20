<template>
    <panel ref="panel" @close="$emit('close')">
        <div v-if="!authentication_handlers.length">
            <h4>{{ $t('authenticate.no_authentication_handlers') }}</h4>
            <p>{{ $t('authenticate.no_authentication_handlers_info') }}</p>
        </div>

        <div v-else-if="authentication_handlers.length !== 1" class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-handler'">
                {{ $t('authenticate.handler') }}
            </label>
            <div class="col-sm-9">
                <select :id="_uid + '-handler'" ref="select" class="custom-select custom-select-sm"
                    :disabled="authenticating" @change="() => selected = parseInt($refs.select.value)"
                >
                    <option v-for="id in authentication_handlers" :key="id" :value="id" :selected="selected === id">
                        {{ getAuthenticationHandlerName(id) }}
                    </option>
                </select>
            </div>
        </div>

        <component v-if="component" :is="component" ref="component" :key="selected"
            :connection="authentication_handler_connection" @authenticating="a => authenticating = a"
            @user="setAuthenticatedUser" @close="() => $refs.panel.close()"
        >
            <template slot="left-buttons">
                <button v-if="localStorage.token" class="btn btn-default btn-sm" type="button"
                    @click="forgetAuthenticatedUser">{{ $t('authenticate.logout') }}</button>
            </template>
            <template slot="right-buttons">
                <button ref="close-button" class="btn btn-default btn-sm" type="button"
                    @click="() => $refs.panel.close()">{{ $t('authenticate.cancel') }}</button>
            </template>
        </component>

        <div v-else class="d-flex">
            <button v-if="localStorage.token" class="btn btn-default btn-sm" type="button"
                @click="forgetAuthenticatedUser">{{ $t('authenticate.logout') }}</button>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" @click="() => $refs.panel.close()">
                {{ $t('authenticate.cancel') }}
            </button>
        </div>
    </panel>
</template>

<script>
    import Connection, {AuthenticationHandlerConnection, AuthenticatedUser} from '../../client/connection';

    import {AuthenticationHandlerComponents as authentication_handler_components} from '../component-registry';
    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
        },
        data() {
            return {
                authentication_handlers: [],
                selected: null,

                authentication_handler_connection: null,
                authenticating: false,

                localStorage,
            };
        },
        computed: {
            component() {
                return this.getAuthenticationHandlerComponent(this.selected);
            },
            close_with_escape_key() {
                return !this.component || !!this.$refs['close-button'];
            },
        },
        watch: {
            authentication_handlers() {
                if (this.authentication_handlers.length === 1) this.selected = this.authentication_handlers[0];
            },
            selected(id, old_id) {
                this.authentication_handler_connection = typeof id !== 'undefined' ?
                    new AuthenticationHandlerConnection(this.connection, id) : null;
                this.authenticating = false;
            },
            connection(connection) {
                if (!this.authentication_handler_connection) return;

                this.authentication_handler_connection.connection = connection;
            },
        },
        created() {
            // Register built in components
            require('./authentication-handlers');

            this.authentication_handlers = [...authentication_handler_components.keys()];

            this.selected = this.authentication_handlers[0];
        },
        methods: {
            getAuthenticationHandlerName(id) {
                const authentication_handler = authentication_handler_components.get(id);

                if (authentication_handler) return authentication_handler.name;
            },
            getAuthenticationHandlerComponent(id) {
                const authentication_handler = authentication_handler_components.get(id);

                if (authentication_handler) return authentication_handler.component;
            },
            setAuthenticatedUser(authenticated_user) {
                if (!(authenticated_user instanceof AuthenticatedUser)) {
                    throw new Error('authenticated_user must be an AuthenticatedUser object');
                }

                this.connection.authenticated_user = authenticated_user;

                // Save the token to localStorage
                localStorage.setItem('token', authenticated_user.token);
            },
            forgetAuthenticatedUser() {
                this.connection.authenticated_user = null;
                localStorage.removeItem('token');
                this.$forceUpdate();
                this.$refs.panel.close();
            },
        },
    };
</script>
