<template>
    <div class="dropdown" :class="{show: open}">
        <button :id="_uid + '-dropdown'" ref="toggle" class="btn btn-sm btn-dark dropdown-toggle" type="button"
            data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" @click.stop="open = !open"
        >
            <span class="d-inline d-sm-none">Menu</span>
            <span class="d-none d-sm-inline">{{ dropdown_label }}</span>
        </button>

        <div ref="menu" class="dropdown-menu dropdown-menu-right" :class="{show: open}"
            :aria-labelledby="_uid + '-dropdown'"
        >
            <a v-if="authenticatedUser && layouts['Overview.' + authenticatedUser.id]" class="dropdown-item"
                :class="{active: value && value.uuid === 'Overview.' + authenticatedUser.id && !showAutomations}"
                href="#" @click.prevent="setLayout(layouts['Overview.' + authenticatedUser.id])">{{ name }}</a>
            <a class="dropdown-item" :class="{active: !value && !showAutomations}" href="#"
                @click.prevent="setLayout(null)">All accessories</a>

            <template v-if="Object.values(layouts).length">
                <div class="dropdown-divider"></div>

                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <a v-for="layout in layouts" v-if="layout.uuid !== 'Overview.' + authenticatedUser.id"
                    :key="layout.uuid" class="dropdown-item"
                    :class="{active: value && value.uuid === layout.uuid && !showAutomations}" href="#"
                    @click.prevent="setLayout(layout)">{{ layout.name || layout.uuid }}</a>
            </template>

            <template v-if="value && (value.can_set || value.can_delete) && !showAutomations">
                <div class="dropdown-divider"></div>

                <a v-if="value.can_set && (!authenticatedUser || value.uuid !== 'Overview.' + authenticatedUser.id)"
                    class="dropdown-item" href="#"
                    @click.prevent="showLayoutSettings">{{ value.name || value.uuid }} Settings</a>
                <a v-if="value.can_set" class="dropdown-item" href="#"
                    @click.prevent="$emit('edit-layout')">Edit layout</a>
                <a v-if="value.can_delete && (!authenticatedUser || value.uuid !== 'Overview.' + authenticatedUser.id)"
                    class="dropdown-item" href="#" @click.prevent="showLayoutDelete">Delete layout</a>
            </template>

            <template v-if="canAccessAutomations">
                <div class="dropdown-divider"></div>

                <a class="dropdown-item" :class="{active: showAutomations}" href="#"
                    @click.prevent="$emit('show-automations', true)">Automations</a>
            </template>

            <div class="dropdown-divider"></div>

            <a class="dropdown-item" href="#"
                @click.prevent="$emit('modal', {type: 'authenticate'})"
            >
                <template v-if="authenticatedUser">
                    <span class="d-inline d-sm-none">{{ authenticatedUser.name }}</span>
                    <span class="d-none d-sm-inline">Authenticated as {{ authenticatedUser.name }}</span>
                </template>
                <template v-else>Login</template>
            </a>

            <a v-if="canUpdateHomeSettings || canAccessServerSettings" class="dropdown-item" href="#"
                @click.prevent="$emit('modal', {type: 'settings'})">Settings</a>
            <a v-if="canCreate" class="dropdown-item" href="#"
                @click.prevent="$emit('modal', {type: 'new-layout'})">New layout</a>
        </div>
    </div>
</template>

<script>
    import Layout from '../layout';
    import {AuthenticatedUser} from '../../common/connection';

    export default {
        props: {
            layouts: Object,
            value: Layout,
            name: {type: String, default: 'Home'},
            authenticatedUser: AuthenticatedUser,
            canCreate: Boolean,
            canUpdateHomeSettings: Boolean,
            canAccessServerSettings: Boolean,
            showAutomations: Boolean,
            canAccessAutomations: Boolean,
        },
        data() {
            return {
                open: false,
            };
        },
        computed: {
            dropdown_label() {
                if (this.showAutomations) return 'Automations';
                if (!this.value) return 'All accessories';

                if (this.authenticatedUser && this.value.uuid === 'Overview.' + this.authenticatedUser.id) {
                    return this.name;
                }

                return this.value.name || this.value.uuid;
            },
        },
        watch: {
            open(open) {
                if (open) document.body.addEventListener('click', this.close, true);
                else document.body.removeEventListener('click', this.close);
            },
        },
        destroy() {
            document.body.removeEventListener('click', this.close);
        },
        methods: {
            setLayout(layout) {
                this.$emit('input', layout);
                this.$emit('show-automations', false);
            },
            showLayoutSettings() {
                this.$emit('modal', {type: 'layout-settings', layout: this.value});
            },
            showLayoutDelete() {
                this.$emit('modal', {type: 'delete-layout', layout: this.value});
            },
            close() {
                this.open = false;
            },
        },
    };
</script>
