<template>
    <dropdown colour="dark" align="right">
        <template slot="label">
            <span class="d-inline d-sm-none">{{ $t('menu.menu') }}</span>
            <span class="d-none d-sm-inline">{{ dropdown_label }}</span>
        </template>

        <a v-if="authenticatedUser && layouts['Overview.' + authenticatedUser.id]" class="dropdown-item"
            :class="{active: value && value.uuid === 'Overview.' + authenticatedUser.id && show_layout}"
            href="#" @click.prevent="setLayout(layouts['Overview.' + authenticatedUser.id])"
        >{{ name || $t('menu.home') }}</a>
        <a class="dropdown-item" :class="{active: !value && show_layout}" href="#"
            @click.prevent="setLayout(null)">{{ $t('menu.all_accessories') }}</a>

        <template v-if="Object.values(layouts).length">
            <div class="dropdown-divider"></div>

            <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
            <a v-for="layout in layouts" v-if="!authenticatedUser || layout.uuid !== 'Overview.' + authenticatedUser.id"
                :key="layout.uuid" class="dropdown-item"
                :class="{active: value && value.uuid === layout.uuid && show_layout}"
                href="#" @click.prevent="setLayout(layout)">{{ layout.name || layout.uuid }}</a>
        </template>

        <template v-if="value && (value.can_set || value.can_delete) && show_layout">
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

        <template v-if="canAccessAutomations || canAccessPlugins">
            <div class="dropdown-divider"></div>

            <a v-if="canAccessAutomations" class="dropdown-item" :class="{active: showAutomations}" href="#"
                @click.prevent="$emit('show-automations', true)">{{ $t('menu.automations') }}</a>
            <a v-if="canAccessPlugins" class="dropdown-item" :class="{active: showPlugins}" href="#"
                @click.prevent="$router.push({name: 'plugins'})">{{ $t('menu.plugins') }}</a>
        </template>

        <template v-for="[category, items] in plugin_items">
            <div :key="'plugin-category-' + getKey(category) + '-divider'" class="dropdown-divider"></div>
            <h6 v-if="items[0].category_name" :key="'plugin-category-' + getKey(category) + '-header'"
                class="dropdown-header">{{ items[0].category_name }}</h6>

            <a v-for="item in items" :key="'plugin-item-' + getKey(item)" class="dropdown-item"
                :class="{active: isMenuItemActive(item)}" href="#"
                @click.prevent="activateMenuItem(item)">{{ item.label }}</a>
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

        <a v-if="canAccessServerSettings" class="dropdown-item" :class="{active: isSettingsActive}" href="#"
            @click.prevent="$router.push({name: 'settings'})">{{ $t('menu.settings') }}</a>
        <a v-if="canCreate" class="dropdown-item" href="#"
            @click.prevent="$emit('modal', {type: 'new-layout'})">{{ $t('menu.new_layout') }}</a>
    </dropdown>
</template>

<script>
    import {AuthenticatedUser} from '../../client/connection';
    import Layout from '../../client/layout';
    import Dropdown from './dropdown.vue';
    import PluginManager, {MenuItem} from '../plugins';

    const keys = new WeakMap();
    let nextkey = 0;

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
            isPluginRouteActive: Boolean,
            pluginViewTitle: {type: String, default: null},
            showAutomations: Boolean,
            canAccessAutomations: Boolean,
            isSettingsActive: Boolean,
            showPlugins: Boolean,
            canAccessPlugins: Boolean,
        },
        data() {
            return {
                raw_plugin_items: PluginManager.plugin_menu_items,
            };
        },
        computed: {
            dropdown_label() {
                if (this.isSettingsActive) return this.$t('menu.settings');
                if (this.isPluginRouteActive) return this.pluginViewTitle || this.$t('menu.home');
                if (this.showAutomations) return this.$t('menu.automations');
                if (this.showPlugins) return this.$t('menu.plugins');
                if (!this.value) return this.$t('menu.all_accessories');

                if (this.authenticatedUser && this.value.uuid === 'Overview.' + this.authenticatedUser.id) {
                    return this.name || this.$t('menu.home');
                }

                return this.value.name || this.value.uuid;
            },
            show_layout() {
                return !this.isSettingsActive && !this.isPluginRouteActive && !this.showAutomations &&
                    !this.showPlugins;
            },
            categorised_plugin_items() {
                const categories = new Map();

                for (const item of this.raw_plugin_items) {
                    let category = categories.get(item.category);
                    if (!category) categories.set(item.category, category = []);

                    category.push(item);
                }

                return categories;
            },
            plugin_items() {
                const categories = new Map();

                for (const [category, items] of this.categorised_plugin_items.entries()) {
                    const filtered_items = [];

                    for (const item of items) {
                        try {
                            if (item.if && !item.if()) continue;
                            filtered_items.push(item);
                        } catch (err) {
                            console.error('Error checking if menu item should be listed', item, err);
                        }
                    }

                    if (filtered_items.length) categories.set(category, filtered_items);
                }

                return categories;
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
            getKey(category) {
                if (typeof category === 'object') {
                    if (!keys.has(category)) keys.set(category, nextkey++);
                    return keys.get(category);
                }

                return (typeof category) + category;
            },
            isMenuItemActive(item) {
                if (typeof item.action === 'string') {
                    return this.$route.matched[0] &&
                        this.$router.resolve(item.action).route.matched[0] === this.$route.matched[0];
                }

                return false;
            },
            activateMenuItem(item) {
                if (typeof item.action === 'string') {
                    this.$router.push(item.action);
                } else {
                    item.action();
                }
            },
        },
    };
</script>
