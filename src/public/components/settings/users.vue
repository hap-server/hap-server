<template>
    <div>
        <div class="user-management-container mb-3">
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
                        <h4>{{ $t('settings.location') }}</h4>

                        <div class="form-group">
                            <input type="text" class="form-control form-control-sm" disabled />

                            <small class="text-muted">
                                {{ $t('settings.location_description') }}
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

        <div class="d-flex">
            <div class="flex-fill"></div>
            <template v-if="editing_user && (editing_user_changed || editing_user_saving)">
                <button key="primary" class="btn btn-primary btn-sm" type="button" :disabled="editing_user_saving"
                    @click="() => $refs['user-component'].save()">{{ $t('settings.save') }}</button>
            </template>
            <template v-else-if="editing_user && (editing_user_permissions_changed || editing_user_permissions_saving)">
                <button key="primary" class="btn btn-primary btn-sm" type="button"
                    :disabled="editing_user_permissions_saving"
                    @click="() => $refs['user-permissions'].save()">{{ $t('settings.save_permissions') }}</button>
            </template>
        </div>
    </div>
</template>

<script>
    import UserList from '../user-list.vue';
    import UserPermissions from '../user-permissions.vue';

    export default {
        components: {
            UserList,
            UserPermissions,
        },
        props: {
            canEditUserPermissions: Boolean,
        },
        data() {
            return {
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
        watch: {
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
        created() {
            // Register built in components
            require('../user-management');
        },
        methods: {
            onscrollEditingUser(event) {
                this.editing_user_scrolled = event.target.scrollTop > 0;
                this.editing_user_can_scroll = event.target.scrollTop <
                    (event.target.scrollHeight - event.target.clientHeight);
            },
        },
    };
</script>
