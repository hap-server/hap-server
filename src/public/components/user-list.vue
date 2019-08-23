<template>
    <div class="list-group list-group-sm user-management-list">
        <div class="user-management-list-scroller-wrap">
            <div class="user-management-list-scroller list-group-contents user-management-list-items">
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <template v-for="(users, handler_id) in handler_users" v-if="users.length">
                    <h4 :key="handler_id">{{ getHandlerName(handler_id) || handler_id }}</h4>
                    <div v-for="user in users" :key="handler_id + '-' + user.id"
                        class="list-group-item list-group-item-action clickable" :class="{active: value === user}"
                        @click="$emit('input', user)"
                    >
                        <div class="list-group-item-contents">{{ user.name || user.id }}</div>
                    </div>
                </template>
            </div>
        </div>

        <div class="list-group-footer user-management-list-buttons">
            <div class="user-management-list-buttons-left">
                <dropdown ref="dropdown" type="up">
                    <button slot="button" class="user-management-add-button" type="button"
                        data-toggle="dropdown" aria-haspopup="true" :disabled="!create_handlers.length"
                        :aria-expanded="$refs.dropdown && $refs.dropdown.open ? 'true' : 'false'"
                        @click.stop="$refs.dropdown.open = !$refs.dropdown.open">+</button>

                    <a v-for="handler in create_handlers" :key="handler.id" class="dropdown-item" href="#"
                        @click.prevent="$emit('create', handler)"
                    >
                        {{ getHandlerName(handler.id) || handler.id }}
                    </a>
                </dropdown>
            </div>
        </div>
    </div>
</template>

<script>
    import {ClientSymbol} from '../internal-symbols';
    import {UserManagementHandlers as user_management_components} from '../component-registry';
    import Dropdown from './dropdown.vue';

    export default {
        components: {
            Dropdown,
        },
        props: {
            value: Object,
        },
        data() {
            return {
                handler_users: {},
            };
        },
        inject: {
            client: {from: ClientSymbol},
        },
        computed: {
            handlers() {
                return [...user_management_components.values()].map(handler => {
                    return new handler(this.client.connection); // eslint-disable-line new-cap
                });
            },
            create_handlers() {
                return this.handlers.filter(h => h.create_component);
            },
        },
        watch: {
            'client.connection'(connection) {
                if (connection) this.reload();
            },
        },
        created() {
            // Register built in components
            require('./user-management');

            this.reload();
        },
        methods: {
            async reload() {
                for (const id of Object.keys(this.handler_users)) {
                    if (!this.handlers.find(h => h.id == id)) this.$delete(this.handler_users, id);
                }

                await Promise.all(this.handlers.map(async handler => {
                    if (!this.handler_users[handler.id]) this.$set(this.handler_users, handler.id, []);

                    try {
                        const users = await handler.getUsers();

                        this.$set(this.handler_users, handler.id, users);
                    } catch (err) {
                        console.error('Error getting users for user management handler', handler, err);
                        this.$delete(this.handler_users, handler.id);
                    }
                }));
            },
            getHandlerName(handler_id) {
                const handler = this.handlers.find(h => h.id == handler_id);
                if (!handler) return;

                return handler.constructor.name || handler.name;
            },
        },
    };
</script>
