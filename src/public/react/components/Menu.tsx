import * as React from 'react';
import ReactiveComponent from '../reactive-component';
import {String} from './Translation';
import Dropdown from './Dropdown';
import {Layout, AuthenticatedUser} from '../../../client';
import PluginManager, {MenuItem} from '../../plugins';
import {withRouter, RouteComponentProps} from 'react-router-dom';
import {bind} from '../util/decorators';
import {AppContext} from '../context';
import {relative} from 'path';

const LayoutSettingsString = String.values('menu.layout_settings');
const AuthenticatedAsString = String.values('menu.authenticated_as');

export enum BuiltinMenuItem {
    ALL_ACCESSORIES,
    AUTOMATIONS,
    PLUGINS,
    SETTINGS,
    PLUGIN_ROUTE,
}

export interface MenuProps {
    name: string | null;
    authenticatedUser: AuthenticatedUser | null;
    layouts: Record<string, Layout>;
    pluginViewTitle: string | null;
    canAccessAutomations: boolean;
    canAccessPlugins: boolean;
    canAccessServerSettings: boolean;
    canCreateLayouts: boolean;
    onToggleLayoutEditing?: () => void;
}

export class Menu extends ReactiveComponent<MenuProps & RouteComponentProps> {
    static contextType = AppContext;
    context!: React.ContextType<typeof AppContext>;

    get user_default_layout() {
        return this.props.authenticatedUser && this.props.layouts['Overview.' + this.props.authenticatedUser.id];
    }

    get other_layouts(): Layout[] {
        return Object.values(this.props.layouts).filter(layout => layout !== this.user_default_layout);
    }

    get active(): Layout | BuiltinMenuItem | null {
        if (this.props.location.pathname === '/') {
            return this.user_default_layout;
        } else if (this.props.location.pathname === '/all-accessories') {
            return BuiltinMenuItem.ALL_ACCESSORIES;
        } else if (this.props.location.pathname === '/automations') {
            return BuiltinMenuItem.AUTOMATIONS;
        } else if (this.props.location.pathname === '/plugins') {
            return BuiltinMenuItem.PLUGINS;
        } else if (this.props.location.pathname === '/settings') {
            return BuiltinMenuItem.SETTINGS;
        } else if (this.props.location.pathname.startsWith('/-')) {
            return BuiltinMenuItem.PLUGIN_ROUTE;
        }

        const layoutmatch = this.props.location.pathname.match(/^\/layout\/([^/])$/);
        if (layoutmatch) {
            const uuid = layoutmatch[1];
            return this.props.layouts[uuid] ?? null;
        }

        return null;
    }

    getRelativeUrl(path: string | Layout | BuiltinMenuItem) {
        if (path instanceof Layout) path = path === this.user_default_layout ? '/' : '/layout/' + path.uuid;
        if (path === BuiltinMenuItem.ALL_ACCESSORIES) path = '/all-accessories';
        if (path === BuiltinMenuItem.AUTOMATIONS) path = '/automations';
        if (path === BuiltinMenuItem.PLUGINS) path = '/plugins';
        if (path === BuiltinMenuItem.SETTINGS) path = '/settings';

        if (typeof path !== 'string') return '#';

        // const r = relative(this.props.location.pathname, path);
        // if (r.startsWith('../')) return r.substr(3);
        // if (r === '') return '.';
        // return r;
        // if (this.context!.native_hook?.router_mode === 'hash') return '#' + path;
        return path.substr(1);
    }

    setLayout(layout: Layout, event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        if (layout === this.user_default_layout) {
            this.props.history.push('/');
        } else {
            this.props.history.push('/layout/' + layout.uuid);
        }
    }

    @bind
    showAllAccessories(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.props.history.push('/all-accessories');
    }

    @bind
    showLayoutSettings(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        if (this.active instanceof Layout) {
            this.context!.modals.add({type: 'layout-settings', layout: this.active});
        }
    }

    @bind
    toggleEditing(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.props.onToggleLayoutEditing?.();
    }

    @bind
    showDeleteLayout(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        if (this.active instanceof Layout) {
            this.context!.modals.add({type: 'delete-layout', layout: this.active});
        }
    }

    @bind
    showAutomations(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.props.history.push('/automations');
    }

    @bind
    showPlugins(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.props.history.push('/plugins');
    }

    @bind
    showAuthenticate(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.context!.modals.add({type: 'authenticate'});
    }

    @bind
    showSettings(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.props.history.push('/settings');
    }

    @bind
    showCreateLayout(event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();
        this.context!.modals.add({type: 'create-layout'});
    }

    render() {
        return <Dropdown colour="dark" align="right" label={<>
            <span className="d-inline d-sm-none"><String name="menu.menu" /></span>
            <span className="d-none d-sm-inline">{this.renderLabelText()}</span>
        </>}>
            {this.user_default_layout ?
                <a
                    className={[
                        'dropdown-item',
                        this.active === this.user_default_layout ? 'active' : null,
                    ].filter(c => c).join(' ')}
                    href={this.getRelativeUrl(this.user_default_layout)}
                    onClick={this.setLayout.bind(this, this.user_default_layout)}
                >
                    {name || <String name="menu.home" />}
                </a> : null}
            <a
                className={[
                    'dropdown-item',
                    this.active === BuiltinMenuItem.ALL_ACCESSORIES ? 'active' : null,
                ].filter(c => c).join(' ')}
                href={this.getRelativeUrl(BuiltinMenuItem.ALL_ACCESSORIES)}
                onClick={this.showAllAccessories}
            >
                <String name="menu.all_accessories" />
            </a>

            {this.other_layouts.length ? <>
                <div className="dropdown-divider" />

                {this.other_layouts.map(layout => <a
                    key={layout.uuid}
                    className={[
                        'dropdown-item',
                        this.active === layout ? 'active' : null,
                    ].filter(c => c).join(' ')}
                    href={this.getRelativeUrl(layout)}
                    onClick={this.setLayout.bind(this, layout)}
                >
                    {layout.name || layout.uuid}
                </a>)}
            </> : null}

            {this.active instanceof Layout && (this.active.can_set || this.active.can_delete) ? <>
                <div className="dropdown-divider" />

                {this.active.can_set && this.active !== this.user_default_layout ? <a
                    className="dropdown-item"
                    href="#"
                    onClick={this.showLayoutSettings}
                ><LayoutSettingsString name={this.active.name || this.active.uuid} /></a> : null}

                {this.active.can_set ? <a className="dropdown-item" href="#" onClick={this.toggleEditing}>
                    <String name="menu.edit_layout" />
                </a> : null}

                {this.active.can_delete ? <a className="dropdown-item" href="#" onClick={this.showDeleteLayout}>
                    <String name="menu.delete_layout" />
                </a> : null}
            </> : null}

            {this.props.canAccessAutomations || this.props.canAccessPlugins ? <>
                <div className="dropdown-divider" />

                {this.props.canAccessAutomations ? <a className={[
                    'dropdown-item',
                    this.active === BuiltinMenuItem.AUTOMATIONS ? 'active' : null,
                ].filter(c => c).join(' ')} href="#" onClick={this.showAutomations}>
                    <String name="menu.automations" />
                </a> : null}

                {this.props.canAccessPlugins ? <a className={[
                    'dropdown-item',
                    this.active === BuiltinMenuItem.PLUGINS ? 'active' : null,
                ].filter(c => c).join(' ')} href="#" onClick={this.showPlugins}>
                    <String name="menu.plugins" />
                </a> : null}
            </> : null}

            {this.renderPluginItems()}

            <div className="dropdown-divider" />

            <a className="dropdown-item" href="#" onClick={this.showAuthenticate}>
                {this.props.authenticatedUser ? <>
                    <span className="d-inline d-sm-none">{this.props.authenticatedUser.name}</span>
                    <span className="d-none d-sm-inline">
                        <AuthenticatedAsString name={this.props.authenticatedUser.name} />
                    </span>
                </> : <String name="menu.login" />}
            </a>

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
                @click.prevent="$emit('modal', {type: 'new-layout'})">{{ $t('menu.new_layout') }}</a> */}

            {this.props.canAccessServerSettings ? <a className={[
                'dropdown-item',
                this.active === BuiltinMenuItem.SETTINGS ? 'active' : null,
            ].filter(c => c).join(' ')} href="#" onClick={this.showSettings}>
                <String name="menu.settings" />
            </a> : null}

            {this.props.canCreateLayouts ? <a className="dropdown-item" href="#" onClick={this.showCreateLayout}>
                <String name="menu.new_layout" />
            </a> : null}
        </Dropdown>;
    }

    renderLabelText() {
        if (this.active === BuiltinMenuItem.SETTINGS) return <String name="menu.settings" />;
        if (this.active === BuiltinMenuItem.PLUGIN_ROUTE) {
            return this.props.pluginViewTitle || <String name="menu.home" />;
        }
        if (this.active === BuiltinMenuItem.AUTOMATIONS) return <String name="menu.automations" />;
        if (this.active === BuiltinMenuItem.PLUGINS) return <String name="menu.plugins" />;
        if (this.active === BuiltinMenuItem.ALL_ACCESSORIES) return <String name="menu.all_accessories" />;

        if (this.active === this.user_default_layout) {
            return this.props.name || <String name="menu.home" />;
        }

        if (this.active instanceof Layout) {
            return this.active.name || this.active.uuid;
        }

        return null;
    }

    raw_plugin_items = PluginManager.plugin_menu_items;

    get categorised_plugin_items() {
        const categories = new Map<any, MenuItem[]>();

        for (const item of this.raw_plugin_items) {
            let category = categories.get(item.category);
            if (!category) categories.set(item.category, category = []);

            category.push(item);
        }

        return categories;
    }

    get plugin_items() {
        const categories = new Map<any, MenuItem[]>();

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
    }

    static readonly keys = new WeakMap();
    static nextkey = 0;

    static getKey(category: any): string | number {
        if (typeof category === 'object') {
            if (!this.keys.has(category)) this.keys.set(category, this.nextkey++);
            return this.keys.get(category)!;
        }

        return (typeof category) + category;
    }

    renderPluginItems() {
        return [...this.plugin_items.entries()].map(([category, items]) => <React.Fragment key={Menu.getKey(category)}>
            <div className="dropdown-divider" />

            {items[0].category_name ? <h6 className="dropdown-header">{items[0].category_name}</h6> : null}

            {items.map(item => <a
                key={Menu.getKey(item)}
                className={[
                    'dropdown-item',
                    this.isMenuItemActive(item) ? 'active' : null,
                ].filter(c => c).join(' ')}
                href="#"
                onClick={this.activateMenuItem.bind(this, item)}
            >{item.label}</a>)}
        </React.Fragment>);
    }

    isMenuItemActive(item: MenuItem) {
        if (this.active === BuiltinMenuItem.PLUGIN_ROUTE && typeof item.action === 'string') {
            // return this.$route.matched[0] &&
            //     this.$router.resolve(item.action).route.matched[0] === this.$route.matched[0];
        }

        return false;
    }

    activateMenuItem(item: MenuItem, event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
        event?.preventDefault();

        if (typeof item.action === 'string') {
            // this.$router.push(item.action);
            this.props.history.push(item.action);
        } else {
            item.action();
        }
    }
}

const MenuWithRouter = withRouter(Menu);
export default MenuWithRouter;
