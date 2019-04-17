<template>
    <panel ref="panel" @close="$emit('close')">
        <div v-if="!authentication_handlers.length">
            <h4>No authentication handlers</h4>
            <p>There are no authentication handlers configured.</p>
        </div>

        <div v-else-if="authentication_handlers.length !== 1" class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-handler'">Handler</label>
            <div class="col-sm-9">
                <select class="custom-select custom-select-sm" ref="select" :id="_uid + '-handler'" :disabled="authenticating" @change="() => selected = parseInt($refs.select.value)">
                    <option v-for="id in authentication_handlers" :key="id" :value="id" :selected="selected === id">{{ getAuthenticationHandlerName(id) }}</option>
                </select>
            </div>
        </div>

        <component v-if="component" ref="component" :key="selected" :is="component"
            :connection="authentication_handler_connection" @authenticating="a => authenticating = a"
            @user="setAuthenticatedUser" @close="() => $refs.panel.close()" />

        <div v-else class="d-flex">
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" @click="() => $refs.panel.close()">Cancel</button>
        </div>
    </panel>
</template>

<script>
    import {AuthenticationHandlerConnection, AuthenticatedUser} from '../connection';
    import authentication_handler_components from './authentication-handlers';
    import Panel from './panel.vue';

    export default {
        props: ['connection'],
        data() {
            return {
                authentication_handlers: [],
                selected: null,

                authentication_handler_connection: null,
                authenticating: false,
            };
        },
        components: {
            Panel,
        },
        created() {
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
            },
        },
        computed: {
            component() {
                return this.getAuthenticationHandlerComponent(this.selected);
            },
        },
        watch: {
            authentication_handlers() {
                if (this.authentication_handlers.length === 1) this.selected = this.authentication_handlers[0];
            },
            selected(id, old_id) {
                this.authentication_handler_connection = typeof id !== 'undefined' ? new AuthenticationHandlerConnection(this.connection, id) : null;
                this.authenticating = false;
            },
            connection(connection) {
                if (!this.authentication_handler_connection) return;

                this.authentication_handler_connection.connection = connection;
            },
        },
    };
</script>
