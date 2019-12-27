<template>
    <dropdown colour="dark" align="right">
        <template slot="label">
            <span class="d-inline d-sm-none">{{ $t('menu.menu') }}</span>
            <span class="d-none d-sm-inline">{{ dropdown_label }}</span>
        </template>

        <a v-if="authenticatedUser && layouts['Overview.' + authenticatedUser.id]" class="dropdown-item"
            :class="{active: value && value.uuid === 'Overview.' + authenticatedUser.id && !showAutomations}"
            href="#" @click.prevent="setLayout(layouts['Overview.' + authenticatedUser.id])"
        >{{ name || $t('menu.home') }}</a>
        <a class="dropdown-item" :class="{active: !value && !showAutomations}" href="#"
            @click.prevent="setLayout(null)">{{ $t('menu.all_accessories') }}</a>

        <template v-if="Object.values(layouts).length">
            <div class="dropdown-divider"></div>

            <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
            <a v-for="layout in layouts" v-if="!authenticatedUser || layout.uuid !== 'Overview.' + authenticatedUser.id"
                :key="layout.uuid" class="dropdown-item"
                :class="{active: value && value.uuid === layout.uuid && !showAutomations}" href="#"
                @click.prevent="setLayout(layout)">{{ layout.name || layout.uuid }}</a>
        </template>

        <template v-if="value && (value.can_set || value.can_delete) && !showAutomations">
            <div class="dropdown-divider"></div>

            <a v-if="value.can_set && (!authenticatedUser || value.uuid !== 'Overview.' + authenticatedUser.id)"
                class="dropdown-item" href="#"
                @click.prevent="showLayoutSettings"
            >{{ $t('menu.layout_settings', {name: value.name || value.uuid}) }}</a>
            <a v-if="value.can_set" class="dropdown-item" href="#"
                @click.prevent="$emit('edit-layout')">{{ $t('menu.edit_layout') }}</a>
            <a v-if="value.can_delete && (!authenticatedUser || value.uuid !== 'Overview.' + authenticatedUser.id)"
                class="dropdown-item" href="#" @click.prevent="showLayoutDelete">{{ $t('menu.delete_layout') }}</a>
        </template>

        <template v-if="canAccessAutomations">
            <div class="dropdown-divider"></div>

            <a class="dropdown-item" :class="{active: showAutomations}" href="#"
                @click.prevent="$emit('show-automations', true)">{{ $t('menu.automations') }}</a>
        </template>

        <div class="dropdown-divider"></div>

        <a class="dropdown-item" href="#"
            @click.prevent="$emit('modal', {type: 'authenticate'})"
        >
            <template v-if="authenticatedUser">
                <span class="d-inline d-sm-none">{{ authenticatedUser.name }}</span>
                <span class="d-none d-sm-inline">
                    {{ $t('menu.authenticated_as', {name: authenticatedUser.name}) }}
                </span>
            </template>
            <template v-else>{{ $t('menu.login') }}</template>
        </a>

        <a v-if="canAccessServerSettings" class="dropdown-item" href="#"
            @click.prevent="$emit('modal', {type: 'settings'})">{{ $t('menu.settings') }}</a>
        <a v-if="canCreate" class="dropdown-item" href="#"
            @click.prevent="$emit('modal', {type: 'new-layout'})">{{ $t('menu.new_layout') }}</a>
    </dropdown>
</template>

<script>
    import {AuthenticatedUser} from '../../client/connection';
    import Layout from '../../client/layout';
    import Dropdown from './dropdown.vue';

    export default {
        components: {
            Dropdown,
        },
        props: {
            layouts: Object,
            value: Layout,
            name: {type: String, default: null},
            authenticatedUser: AuthenticatedUser,
            canCreate: Boolean,
            canAccessServerSettings: Boolean,
            showAutomations: Boolean,
            canAccessAutomations: Boolean,
        },
        computed: {
            dropdown_label() {
                if (this.showAutomations) return this.$t('menu.automations');
                if (!this.value) return this.$t('menu.all_accessories');

                if (this.authenticatedUser && this.value.uuid === 'Overview.' + this.authenticatedUser.id) {
                    return this.name || this.$t('menu.home');
                }

                return this.value.name || this.value.uuid;
            },
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
        },
    };
</script>
