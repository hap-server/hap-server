
import * as React from 'react';
import ReactiveComponent from '../reactive-component';
import {BrowserRouter, HashRouter, Switch, Route} from 'react-router-dom';
import {bind} from '../util/decorators';
import {AppContext} from '../context';
import {NativeHook} from '../../native-hook';
import Modals from '../../modals';
import PluginManager from '../../plugins';
import {Client, Connection, AuthenticatedUser, Accessory, Service, Scene, Layout} from '../../../client';
import {BridgeService, UnsupportedService} from '../../../client/service';
import {String} from './Translation';
import Menu from './Menu';
import ModalsComponent from './Modals';

const instances = new Set<App>();

declare global {
    interface Navigator {
        standalone?: boolean;
    }
}

interface AppProps {
    native_hook: NativeHook | null;
    modals: Modals<typeof ModalsComponent, React.Component & {
        show: boolean;
    }>;
    client: Client;
    errors: any;
    getAssetURL: (asset: string) => string;
    setAssetToken?: (token: string | null) => void;
}

export default class App extends ReactiveComponent<AppProps> {
    $router: any;
    $route: {
        name: string; fullPath: string;
        params: Record<string, string | undefined>;
        query: Record<string, string | undefined>;
    } = {name: 'user-default-layout', fullPath: '/', params: {}, query: {}};
    $refs: any;
    $t = (string: string) => string;

    get native_hook() {
        return this.props.native_hook;
    }
    get modals() {
        return this.props.modals;
    }
    get client() {
        return this.props.client;
    }
    getAssetURL(asset: string) {
        return this.props.getAssetURL(asset);
    }
    get errors() {
        return this.props.errors;
    }

    connection: Connection | null = null;
    last_connection: Connection | null = null;
    has_connected = false;
    has_loaded = false;
    loading = false;
    should_open_setup: boolean | string = false;

    name: string | null = null;
    default_background_url: string | null = null;
    last_layout_uuid: string | null = null;
    force_update_layout = false;

    plugin_view_title: string | null = null;
    plugin_view_background_url: string | null = null;

    plugins_title: string | null = null;
    can_access_plugins = false;

    automations_title: string | null = null;
    can_access_automations = false;

    can_update_home_settings = false;
    can_access_server_settings = false;
    can_open_console = false;
    can_add_accessories = false;
    can_create_bridges = false;
    can_create_layouts = false;
    can_manage_users = false;
    can_manage_permissions = false;
    loading_permissions = false;

    refresh_accessories_timeout: NodeJS.Timeout | null = null;

    bridge_uuids: string[] = [];
    loading_bridges = false;

    scrolled = false;

    editing = false;
    loading_ui_plugins = false;

    get layout_uuid(): string | null {
        if (this.$route.name === 'user-default-layout' && this.authenticated_user) {
            return 'Overview.' + this.authenticated_user.id;
        } else if (this.$route.name === 'layout') {
            return this.$route.params.layout_uuid ?? null;
        }

        return this.last_layout_uuid;
    }
    set layout_uuid(layout_uuid) {
        if (layout_uuid && this.authenticated_user && layout_uuid === 'Overview.' + this.authenticated_user.id) {
            this.$router.push({name: 'user-default-layout'});
        } else if (layout_uuid) {
            this.$router.push({name: 'layout', params: {layout_uuid: layout_uuid}});
        } else {
            this.$router.push({name: 'all-accessories'});
        }

        this.last_layout_uuid = layout_uuid;
    }

    get layout(): Layout | null {
        // Forces Vue to update this when the layout has loaded
        this.force_update_layout;

        return this.layout_uuid && this.layouts[this.layout_uuid] || null;
    }
    set layout(layout) {
        this.layout_uuid = layout ? layout.uuid : null;
    }

    get show_layout() {
        return !this.is_settings_active && !this.is_plugin_route_active && !this.show_automations &&
            !this.show_plugins;
    }
    get show_automations() {
        return this.$route.name === 'automations';
    }
    set show_automations(show_automations) {
        if (show_automations) this.$router.push({name: 'automations'});
        else this.layout_uuid = this.last_layout_uuid;
    }

    get show_plugins() {
        return ['plugins', 'plugin'].includes(this.$route.name);
    }
    get is_plugin_route_active() {
        return this.$route.fullPath.startsWith('/-');
    }
    get is_settings_active() {
        // return this.$route.path === '/settings' || this.$route.path.startsWith('/settings/');
        return this.$route.name === 'settings';
    }

    get title() {
        if (this.modals.modal_open) {
            // @ts-ignore
            return this.modals.stack[this.modals.stack.length - 1].title;
        }

        if (this.is_settings_active) {
            return this.$t('main.settings');
        }

        if (this.is_plugin_route_active) {
            return this.plugin_view_title || this.$t('main.home');
        }

        if (this.show_automations) {
            return this.automations_title || this.$t('main.automations');
        }

        if (this.show_plugins) {
            return this.plugins_title || this.$t('main.plugins');
        }

        return this.name || this.$t('main.home');
    }
    get background_url() {
        if (this.is_settings_active) return;
        if (this.is_plugin_route_active) return this.plugin_view_background_url;
        if (this.show_automations) return;
        if (this.show_plugins) return;

        if (this.layout && this.layout.background_url) return this.getAssetURL(this.layout.background_url);
        if (this.default_background_url) return this.getAssetURL(this.default_background_url);

        return require('../../../../assets/default-wallpaper.jpg');
    }
    get modal_open() {
        return this.connecting || this.modals.modal_open ||
            (this.show_automations && this.$refs.automations && this.$refs.automations.open_automation);
    }
    get accessory_details_open() {
        return this.connecting || !!this.modals.getDisplayModals().find(m =>
            m.type === 'accessory-details' && (!m.instance || m.instance.show));
    }
    get authenticated_user() {
        // @ts-ignore
        return this.last_connection ? this.last_connection.authenticated_user : null;
    }
    get preload_urls() {
        const preload_urls = [require('../../../../assets/default-wallpaper.jpg')];

        for (const layout of Object.values(this.layouts)) {
            if (layout.background_url && !preload_urls.includes(layout.background_url)) {
                preload_urls.push(this.getAssetURL(layout.background_url));
            }
        }

        return preload_urls;
    }

    get connecting() {
        // @ts-ignore
        return this.client.connecting;
    }
    get accessories() {
        return this.client.accessories || (this.client.accessories = {});
    }
    get layouts() {
        return this.client.layouts || (this.client.layouts = {});
    }
    get scenes() {
        return this.client.scenes || (this.client.scenes = {});
    }

    /* eslint-disable */
    readonly appcontext: AppContext = {
        get native_hook() {return this.native_hook;},
        get modals() {return this.modals;},
        get client() {return this.client;},
        getAssetURL: asset => this.getAssetURL(asset),
        get errors() {return this.errors;},

        get bridge_uuids() {return this.bridge_uuids;},
        getAllDisplayServices: () => this.getAllServices(),
        getService: (uuid, service_uuid) => this.getService(uuid, service_uuid),
    };
    /* eslint-enable */

    reactivity_test = 1;
    computed_test_count = 0;

    get computed_test() {
        this.computed_test_count++;
        return this.reactivity_test * 2;
    }

    render() {
        // @ts-ignore
        global.$root = this;

        // const Router = this.native_hook?.router_mode === 'hash' ? HashRouter : BrowserRouter;
        const Router = BrowserRouter;

        return <AppContext.Provider value={this.appcontext}>
            <Router>
                <div className={[
                    'root',
                    this.scrolled ? 'scrolled' : null,
                    this.modal_open ? 'has-open-modals' : null,
                    this.accessory_details_open ? 'has-accessory-details-open' : null,
                ].filter(c => c).join(' ')}>
                    {this.renderHeader()}

                    {this.renderMain()}

                    <div className="section">
                        <p>Reactivity test: {this.computed_test} - {this.computed_test_count}</p>
                        <button onClick={() => this.reactivity_test++}>Increment</button>
                    </div>;

                    {this.renderModals()}
                    {this.connection ? null : <div className={
                        'connecting' + (this.has_connected ? ' reconnecting' : '')
                    }>
                        <p><String name={this.has_connected ? 'main.reconnecting' : 'main.connecting'} /></p>
                    </div>}

                    {this.renderErrors()}
                    {this.renderPreloads()}
                </div>
            </Router>
        </AppContext.Provider>;
    }

    renderHeader() {
        return <div className="header">
            <div className="left" />

            <h1>
                {this.renderHeaderText()}
                <span className="d-none d-sm-inline">{this.name || <String name="main.home" />}</span>
            </h1>

            <div className="right">
                <Menu name={this.name} authenticatedUser={this.authenticated_user} layouts={this.client.layouts || {}}
                    pluginViewTitle={this.plugin_view_title} canAccessAutomations={this.can_access_automations}
                    canAccessPlugins={this.can_access_plugins} canAccessServerSettings={
                        this.can_access_server_settings || this.can_update_home_settings || this.can_open_console ||
                        this.can_add_accessories || this.can_create_bridges || this.can_create_layouts ||
                        this.can_manage_users
                    } canCreateLayouts={this.can_create_layouts} onToggleLayoutEditing={this.toggleEditing} />
            </div>
        </div>;
    }

    @bind
    toggleEditing() {
        this.editing = !this.editing;
    }

    renderHeaderText() {
        if (this.is_settings_active) {
            return <span className="d-inline d-sm-none"><String name="main.settings" /></span>;
        } else if (this.is_plugin_route_active) {
            return <span className="d-inline d-sm-none">
                {this.plugin_view_title || <String name="main.home" />}
            </span>;
        } else if (this.show_automations) {
            return <span className="d-inline d-sm-none"><String name="main.automations" /></span>;
        } else if (this.show_plugins) {
            return <span className="d-inline d-sm-none"><String name="main.plugins" /></span>;
        } else if (this.layout &&
            !(this.authenticated_user && this.layout.uuid === 'Overview.' + this.authenticated_user.id)
        ) {
            return <span className="d-inline d-sm-none">{this.layout.name || <String name="main.home" />}</span>;
        } else {
            return <span className="d-inline d-sm-none">{this.name || <String name="main.home" />}</span>;
        }
    }

    renderMain() {
        return <Switch>
            <Route path="/settings" exact>
                {/* <Settings isLoadingAccessories={this.client.loading_accessories}
                    canAddAccessories={this.can_add_accessories} canCreateBridges={this.can_create_bridges}
                    canOpenConsole={this.can_open_console} canManageUsers={this.can_manage_users}
                    canEditUserPermissions={this.can_manage_permissions}
                    canAccessServerInfo={this.can_access_server_settings} onPushModal={modal => this.modals.add(modal)}
                    onShowAccessorySettings={accessory => this.modals.add({type: 'accessory-settings', accessory})}
                    onRefreshAccessories={this.client.refreshAccessories()} onUpdatedSettings={this.reload}
                /> */}
            </Route>
            <Route path="/-">
                {/* <PluginRoute client={this.client} setTitle={title => this.plugin_view_title = title}
                    setBackgroundUrl={background_url => this.plugin_view_background_url = background_url} /> */}
            </Route>
            <Route path="/automations" exact>
                {/* <Automations client={this.client} setTitle={title => this.automations_title = title} /> */}
            </Route>
            <Route path={['/', '/layout/:id']}>
                <div className="main">
                    {this.has_loaded ? this.renderLayout() : this.renderLoading()}
                </div>
            </Route>
        </Switch>;
    }

    renderLayout() {
        return <>
            <h1>Home</h1>

            <div className="section">
                <p>React test</p>

                <Route path={['/layout/:id']}>
                    {({match}) => match && <p>Layout UUID: {match.params.id}</p>}
                </Route>
            </div>
        </>;
    }

    renderLoading() {
        return <>
            <h1>{this.name || <String name="main.home" />}</h1>

            <div className="section">
                {/* <p><Spinner size="inherit" light /> {this.$t('main.loading')}</p> */}
            </div>
        </>;
    }

    renderModals() {
        return null;

        // return <this.modals.component ref={this.modals_ref} modals={this.modals} client={this.client}
        //     canAddAccessories={this.can_add_accessories} canCreateBridges={this.can_create_bridges}
        //     canOpenConsole={this.can_open_console} canManageUsers={this.can_manage_users}
        //     canManagePermissions={this.can_manage_permissions} canAccessServerSettings={this.can_access_server_settings}
        //     bridgeUuids={this.bridge_uuids}
        //     setupToken={typeof this.should_open_setup === 'string' ? this.should_open_setup : null}
        //     onUpdatedSettings={this.reload} onNewLayout={this.addAndShowLayout} onRemoveLayout={this.removeLayout}
        //     onNewAccessory={this.addAccessory} onRemoveAccessory={this.removeAccessory} onNewScene={this.addScene}
        //     onRemoveScene={this.removeScene} />;
    }

    renderErrors() {
        if (!this.errors.length) return null;

        return <div className="errors panel-no-frame">
            <div className="settings-window">
                {this.errors.map((error: any, index: any) => <div className="error" key={index}>
                    <pre className="selectable">
                        <code>Error: {error.err.message}</code>
                        {error.err.stack ? <code>{error.err.stack.substr(error.err.stack.indexOf('\n'))}</code> : null}
                    </pre>
                    <button className="btn btn-default btn-sm" onClick={this.errors.splice(index, 1)}>
                        <String name="main.errors.ignore" />
                    </button>
                </div>)}
            </div>
        </div>;
    }

    renderPreloads() {
        return this.preload_urls.map(url => <div key={url}>
            <link rel="preload" href={url} as="image" />
            <link rel="prefetch" href={url} />
        </div>);
    }

    /* eslint-disable no-invalid-this */

    _a: any = (this.$effect(() => {
        instances.add(this);
        return () => instances.delete(this);
    }, () => []),

    this.$effect(() => {
        window.addEventListener('message', this.receiveMessage);
        window.addEventListener('keypress', this.onkeypress);
        window.addEventListener('scroll', this.onscroll);
        window.addEventListener('touchmove', this.onscroll);

        return () => {
            window.removeEventListener('message', this.receiveMessage);
            window.removeEventListener('keypress', this.onkeypress);
            window.removeEventListener('scroll', this.onscroll);
            window.removeEventListener('touchmove', this.onscroll);
        };
    }, null),

    this.$effect(client => {
        client.on('connected', this.connected);
        client.on('disconnected', this.disconnected);
        client.on('update-home-settings', this.handleUpdateHomeSettings);
        client.on('update-home-permissions', this.setPermissions);
        // client.on('add-automation', this.handleAddAutomation);
        client.on('updated-accessories', this.handleUpdatedAccessories);
        client.on('updated-layouts', this.handleUpdatedLayouts);

        return () => {
            client.removeListener('connected', this.connected);
            client.removeListener('disconnected', this.disconnected);
            client.removeListener('update-home-settings', this.handleUpdateHomeSettings);
            client.removeListener('update-home-permissions', this.setPermissions);
            // client.removeListener('add-automation', this.handleAddAutomation);
            client.removeListener('updated-accessories', this.handleUpdatedAccessories);
            client.removeListener('updated-layouts', this.handleUpdatedLayouts);
        };
    }, () => this.client),

    this.$effect(client => {
        // These won't load anything as the client hasn't authenticated (or even connected) yet
        // This is just to add this component as a dependency so they won't automatically be unloaded
        client.loadAccessories(this);
        client.loadLayouts(this);
        client.loadScenes(this);

        return () => {
            client.unloadAccessories(this);
            client.unloadLayouts(this);
            client.unloadScenes(this);
        };
    }, () => this.client),

    this.$effect(() => {
        const refresh_accessories_function = async () => {
            await this.client.refreshAccessories();

            this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 600000);
        };
        this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 10000);

        return () => {
            clearTimeout(this.refresh_accessories_timeout!);
        };
    }, null),

    this.$watch('title', (title: string) => {
        document.title = title;
    }),

    this.$watch(() => this.authenticated_user, async authenticated_user => {
        this.props.setAssetToken?.(authenticated_user?.asset_token ?? null);

        if (!authenticated_user) return;

        await Promise.all([
            this.client.refreshLoaded(),
            this.reload(),
            this.reloadPermissions(),
            this.reloadBridges(),
            // @ts-ignore
            this.client.system_information_dependencies.size ?
                this.client.connection!.subscribeSystemInformation() : null,
        ]).catch(err => {
            this.errors.push({err, vm: this, info: 'watch authenticated_user'});
        }).then(() => {
            this.has_loaded = true;
        });
    }),

    this.$watch(() => this.layout, layout => {
        // Only save the layout when using running as a web clip
        if (!navigator.standalone) return;

        // Save the current layout
        if (layout) localStorage.setItem('layout', layout.uuid);
        else localStorage.removeItem('layout');
    }),

    this.$watch(() => this.layouts, (layouts, old_layouts) => {
        const layout_uuid = localStorage.getItem('layout');
        if (layout_uuid && this.layouts[layout_uuid] && !this.layout) this.layout_uuid = layout_uuid;

        if (!navigator.standalone && layout_uuid) localStorage.removeItem('layout');

        // Force Vue to update the layout
        this.force_update_layout = !this.force_update_layout;
    }, {deep: true}),

    null);

    /* eslint-enable no-invalid-this */

    async componentDidMount() {
        super.componentDidMount?.();

        // instances.add(this);

        if (this.$route.name === 'setup') {
            this.should_open_setup = this.$route.query.token || true;
            this.$router.replace({name: 'user-default-layout'});
        }

        // window.addEventListener('message', this.receiveMessage);
        // window.addEventListener('keypress', this.onkeypress);
        // window.addEventListener('scroll', this.onscroll);
        // window.addEventListener('touchmove', this.onscroll);
        document.scrollingElement!.scrollTo(0, 0);
        document.title = this.title;

        // this.client.on('connected', this.connected);
        // this.client.on('disconnected', this.disconnected);
        // this.client.on('update-home-settings', this.handleUpdateHomeSettings);
        // this.client.on('update-home-permissions', this.setPermissions);
        // // this.client.on('add-automation', this.handleAddAutomation);
        // this.client.on('updated-accessories', this.handleUpdatedAccessories);
        // this.client.on('updated-layouts', this.handleUpdatedLayouts);

        // // These won't load anything as the client hasn't authenticated (or even connected) yet
        // // This is just to add this component as a dependency so they won't automatically be unloaded
        // this.client.loadAccessories(this);
        // this.client.loadLayouts(this);
        // this.client.loadScenes(this);

        await this.client.tryConnect();

        // await Promise.all([
        //     this.reload(),
        //     this.loadAccessoryUIs(),
        //     this.reloadBridges(),
        //     this.refreshAccessories(true),
        // ]);

        // const refresh_accessories_function = async () => {
        //     await this.client.refreshAccessories();

        //     this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 600000);
        // };
        // this.refresh_accessories_timeout = setTimeout(refresh_accessories_function, 10000);
    }

    componentWillUnmount() {
        super.componentWillUnmount?.();

        // clearTimeout(this.refresh_accessories_timeout!);

        // window.removeEventListener('message', this.receiveMessage);
        // window.removeEventListener('keypress', this.onkeypress);
        // window.removeEventListener('scroll', this.onscroll);
        // window.removeEventListener('touchmove', this.onscroll);

        this.client.disconnect();

        // this.client.unloadAccessories(this);
        // this.client.unloadLayouts(this);
        // this.client.unloadScenes(this);

        // instances.delete(this);
    }

    @bind
    async connected(connection: Connection) {
        console.log('Connected', this, connection);

        this.connection = connection;
        this.has_connected = true;

        // if (process.env.NODE_ENV === 'development') {
        //     const development_data = await this.connection.send({type: 'development-data'});

        //     if (development_data.vue_devtools_port) {
        //         const devtools = require('@vue/devtools');
        //         devtools.connect(development_data.vue_devtools_host, development_data.vue_devtools_port);
        //     }
        // }

        const loadUIPlugins = this.loadWebInterfacePlugins();

        await Promise.all([
            loadUIPlugins,
            this.should_open_setup ? loadUIPlugins.then(() => {
                // @ts-ignore
                if (!this.modals.modal_open || this.modals.stack[this.modals.stack.length - 1].type !== 'setup') {
                    this.modals.add({type: 'setup'});
                }
            }) : this.tryRestoreSession().catch(() => loadUIPlugins.then(() => {
                // @ts-ignore
                if (!this.modals.modal_open || this.modals.stack[this.modals.stack.length - 1].type !== 'authenticate'
                ) {
                    this.modals.add({type: 'authenticate'});
                }
            })),
        ]);

        this.last_connection = connection;
    }

    @bind
    disconnected() {
        this.connection = null;

        // The asset token is only valid while the WebSocket is connected
        this.props.setAssetToken?.(null);

        this.client.tryConnect();
    }

    async tryRestoreSession() {
        // Restore the previous session
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No previous session');

        const response = await this.connection!.send({
            type: 'authenticate',
            token,
        });

        if (response.reject || !response.success) throw new Error('Error restoring session');

        const authenticated_user = new AuthenticatedUser(response.authentication_handler_id, response.user_id);

        Object.defineProperty(authenticated_user, 'token', {value: token});
        Object.defineProperty(authenticated_user, 'asset_token', {value: response.asset_token});
        Object.assign(authenticated_user, response.data);

        // @ts-ignore
        return this.connection.authenticated_user = authenticated_user;
    }

    @bind
    async receiveMessage(event: MessageEvent) {
        if (event.origin !== location.origin) return;

        if (event.data && event.data.type === 'modal') {
            const modal = event.data.modal;

            if (modal.type === 'layout-settings' || modal.type === 'delete-layout') {
                modal.layout = this.client.layouts?.[modal.layout];
            }

            if (modal.type === 'accessory-settings' || modal.type === 'delete-bridge' ||
                modal.type === 'pairing-settings'
            ) {
                modal.accessory = this.client.accessories?.[modal.accessory];
            }

            if (modal.type === 'pairing-settings') {
                // @ts-ignore
                [[modal.pairing], [modal.data], [modal.permissions]] = await Promise.all([
                    this.client.connection?.getPairings([modal.accessory.uuid, modal.pairing]),
                    this.client.connection?.getPairingsData(modal.pairing),
                    this.client.connection?.getPairingsPermissions(modal.pairing),
                ]);
            }

            if (modal.type === 'service-settings') {
                modal.accessory = this.client.accessories![modal.accessory];
                modal.service = modal.accessory.services![modal.service];
            }

            if (modal.type === 'scene-settings') {
                // TODO: fix this in the Vue version as well
                // @ts-ignore
                modal.scene = this.client.scene[modal.scene];
            }

            this.modals.add(modal);
        }
    }

    @bind
    handleUpdateHomeSettings(data: any) {
        this.name = data.name;
        this.default_background_url = data.background_url;
    }

    @bind
    handleAddAutomation() {
        this.can_access_automations = true;
    }

    @bind
    handleUpdatedAccessories() {
        // Force Vue to update the layout
        this.force_update_layout = !this.force_update_layout;
    }

    @bind
    handleUpdatedLayouts() {
        // Force Vue to update the layout
        this.force_update_layout = !this.force_update_layout;
    }

    // async ping() {
    //     console.log('Sending ping request');
    //     // @ts-ignore
    //     const response = await this.connection.send('ping');
    //     console.log('Ping response', response);
    // }

    @bind
    async reload() {
        if (this.loading) throw new Error('Already loading');
        this.loading = true;

        try {
            const data = await this.connection!.getHomeSettings();

            this.name = data.name ?? null;
            this.default_background_url = data.background_url ?? null;
        } finally {
            this.loading = false;
        }
    }

    async reloadPermissions() {
        if (this.loading_permissions) throw new Error('Already loading permissions');
        this.loading_permissions = true;

        try {
            this.setPermissions(await this.connection!.getHomePermissions());
        } finally {
            this.loading_permissions = false;
        }
    }

    @bind
    setPermissions(permissions: any) {
        this.can_update_home_settings = !!permissions.set;
        this.can_access_server_settings = !!permissions.server;
        this.can_open_console = !!permissions.console;
        this.can_add_accessories = !!permissions.add_accessories;
        this.can_create_bridges = !!permissions.create_bridges;
        this.can_create_layouts = !!permissions.create_layouts;
        this.can_access_automations = permissions.has_automations || permissions.create_automations;
        this.can_manage_users = !!permissions.users;
        this.can_manage_permissions = !!permissions.permissions;
        this.can_access_plugins = !!permissions.plugins;
    }

    async loadWebInterfacePlugins() {
        if (this.loading_ui_plugins) throw new Error('Already loading web interface plugins');
        this.loading_ui_plugins = true;

        try {
            const ui_plugins = await this.connection!.getWebInterfacePlugins();

            await Promise.all(ui_plugins.map(ui_plugin => PluginManager.loadWebInterfacePlugin(ui_plugin)));
        } finally {
            this.loading_ui_plugins = false;
        }
    }

    @bind
    addAccessory(accessory: Accessory) {
        this.$set(this.accessories, accessory.uuid, accessory);
        this.$emit('new-accessory', accessory);
        this.$emit('new-accessories', [accessory]);
        this.$emit('update-accessories', [accessory], []);
    }

    @bind
    removeAccessory(accessory: Accessory) {
        this.$delete(this.accessories, accessory.uuid);
        this.$emit('removed-accessory', accessory);
        this.$emit('removed-accessories', [accessory]);
        this.$emit('update-accessories', [], [accessory]);
    }

    addLayout(layout: Layout) {
        this.$set(this.layouts, layout.uuid, layout);
        this.$emit('new-layout', layout);
        this.$emit('new-layouts', [layout]);
        this.$emit('updated-layouts', [layout], []);
    }

    @bind
    addAndShowLayout(layout: Layout) {
        this.addLayout(layout);
        this.layout = layout;
    }

    @bind
    removeLayout(layout: Layout) {
        if (this.layout === layout) this.layout = null;

        this.$delete(this.layouts, layout.uuid);
        this.$emit('removed-layout', layout);
        this.$emit('removed-layouts', [layout]);
        this.$emit('updated-layouts', [], [layout]);
    }

    @bind
    addScene(scene: Scene) {
        this.$set(this.scenes, scene.uuid, scene);
        this.$emit('new-scene', scene);
        this.$emit('new-scenes', [scene]);
        this.$emit('updated-scenes', [scene], []);
    }

    @bind
    removeScene(scene: Scene) {
        this.$delete(this.scenes, scene.uuid);
        this.$emit('removed-scene', scene);
        this.$emit('removed-scenes', [scene]);
        this.$emit('updated-scenes', [], [scene]);
    }

    async reloadBridges() {
        if (this.loading_bridges) throw new Error('Already loading bridges');
        this.loading_bridges = true;

        try {
            const new_bridge_uuids = await this.connection!.listBridges(true);
            this.bridge_uuids.splice(0, this.bridge_uuids.length, ...new_bridge_uuids);
        } finally {
            this.loading_bridges = false;
        }
    }

    @bind
    onscroll() {
        this.scrolled = document.scrollingElement!.scrollTop > 60;
    }

    @bind
    onkeypress(event: KeyboardEvent) {
        if (event.key === 'Escape' && this.modals.modal_open && this.$refs.modals &&
            // @ts-ignore
            this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)] &&
            // @ts-ignore
            this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0] &&
            // @ts-ignore
            this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].close_with_escape_key
        ) {
            // @ts-ignore
            if (this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].$refs.panel) {
                // @ts-ignore
                this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].$refs.panel.close(event);
            } else {
                // @ts-ignore
                this.$refs.modals.$refs['modal-' + (this.modals.stack.length - 1)][0].close(event);
            }

            event.preventDefault();
        }
    }

    findServices(callback: (service: Service) => boolean) {
        const services = [];

        for (const accessory of Object.values(this.accessories)) {
            services.push(...accessory.findServices(callback));
        }

        return services;
    }

    getAllServices() {
        // Forces Vue to update this when the layout has loaded
        this.force_update_layout;

        const services: string[] = [];

        for (const accessory of Object.values(this.accessories)) {
            // Bridge tile
            if (this.bridge_uuids.includes(accessory.uuid)) services.push(accessory.uuid + '.--bridge');

            // Not supported tile
            else if (!accessory.display_services.length) services.push(accessory.uuid + '.');

            for (const service of accessory.display_services) {
                services.push(accessory.uuid + '.' + service.uuid);
            }
        }

        return services;
    }

    getService(uuid: string, service_uuid?: string) {
        const accessory_uuid = uuid.split('.', 1)[0];
        if (!service_uuid) service_uuid = uuid.substr(accessory_uuid.length + 1);

        const accessory = this.accessories[accessory_uuid];
        if (!accessory) return null;

        if (service_uuid === '--bridge') {
            if (!this.bridge_uuids.includes(accessory.uuid)) return null;

            // {accessory, type: '--bridge'}
            return BridgeService.for(accessory);
        }

        if (!service_uuid) {
            // {accessory}
            return UnsupportedService.for(accessory);
        }

        return accessory.display_services.find(s => s.uuid === service_uuid) ?? null;
    }
}
