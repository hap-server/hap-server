if (process.env.NODE_ENV === 'development') {
    require('@vue/devtools');
}

import * as url from 'url';

import './native-hook';

import {NativeHookSymbol, ModalsSymbol, ClientSymbol, GetAssetURLSymbol, ErrorsSymbol} from './internal-symbols';
import * as InternalSymbols from './internal-symbols';
import Client from '../client/client';
import Connection from '../client/connection';

import {ServiceTileComponents} from './component-registry';

import Vue from 'vue';
import VueRouter from 'vue-router';
import VueI18n from 'vue-i18n';

Vue.use(VueRouter);
Vue.use(VueI18n);

// @ts-ignore
import MainComponent from './components/main-component.vue';

// Use './window-modals' to open modals in separate windows
import Modals from './modals';
// @ts-ignore
import ModalsComponent from './components/modals.vue';

type VueRouterMode = 'history' | 'hash';
// @ts-ignore
const default_router_mode: VueRouterMode = navigator.standalone ? 'hash' : 'history';

const router = new VueRouter({
    mode: default_router_mode,
    routes: [
        {name: 'user-default-layout', path: '/'},
        {name: 'layout', path: '/layout/:layout_uuid'},
        {name: 'all-accessories', path: '/all-accessories'},
        {name: 'automations', path: '/automations'},
        {name: 'settings', path: '/settings'},
        {name: 'plugins', path: '/plugins'},
        {name: 'plugin', path: '/plugins/:plugin_name'},
        {name: 'setup', path: '/setup'},
    ],
});

import messages from './translations/en-GB';
const availableLocales = [];
const translationsContextRequire: {
    (key: string): any;
    resolve: (key: string) => string | number; // string if using named modules, number otherwise
    keys: () => string[];
    id: string | number;
// @ts-ignore
} = require.context('./translations', true, /\.ts$/, 'weak');

for (const file of translationsContextRequire.keys()) {
    const [, locale] = file.match(/\/([^/]*)\.[^/.]+$/i)!;
    console.log(locale, file);
    availableLocales.push(locale);

    // @ts-ignore
    if (module.hot) {
        const m = translationsContextRequire.resolve(file);
        const c = (updated: string) => {
            i18n.setLocaleMessage(locale, translationsContextRequire(file).default);
        };

        // @ts-ignore
        module.hot.accept(m, c);
        // @ts-ignore
        require.cache[translationsContextRequire.id].hot.accept(m, c);
    }
}

const i18n = new VueI18n({
    locale: 'en-GB',
    fallbackLocale: 'en-GB',
    messages: {'en-GB': messages},
    // @ts-ignore
    availableLocales,
});

import PluginManager from './plugins';

PluginManager.on('add-plugin-routes', routes => {
    router.addRoutes(routes);
});

const native_hook = global.__HAP_SERVER_NATIVE_HOOK__ ? global.__HAP_SERVER_NATIVE_HOOK__({
    InternalSymbols,
    PluginManager,
    Client,
    Connection,
    Vue,
    MainComponent,
    router,
    Modals,
    ModalsComponent,
}) : null;

if (native_hook && native_hook.router_mode !== default_router_mode) {
    // Re-initialise the router using the hash mode
    // @ts-ignore
    router.options.mode = native_hook.router_mode || 'hash';
    // @ts-ignore
    router.constructor.call(router, router.options);
}

Object.defineProperty(PluginManager, 'base_url', {
    configurable: true,
    enumerable: true,
    get: () => native_hook && native_hook.base_url || '/',
});

const client = new (native_hook && native_hook.Client ? native_hook.Client : Client)(
    undefined, undefined, ServiceTileComponents);
const modals = new (native_hook && native_hook.Modals ? native_hook.Modals : Modals)(client);
modals.component = ModalsComponent;
modals.i18n = i18n;

// const cached_data_json = localStorage.getItem('CachedData');
// if (cached_data_json) client.restoreCachedData(cached_data_json);
// client.on('cached-data', data => localStorage.setItem('CachedData', data));

function getAssetURL(asset: string) {
    if (native_hook && native_hook.base_url) {
        return url.resolve(native_hook.base_url, 'assets/' + asset);
    }

    return '/assets/' + asset;
}

const errors: {err: Error; vm: Vue; info: string}[] = [];

const vue = new Vue({
    router,
    i18n,

    data: {
        errors,
    },
    provide() {
        return {
            [NativeHookSymbol]: native_hook,
            [ModalsSymbol]: modals,
            [ClientSymbol]: client,
            [GetAssetURLSymbol]: (asset: string) => getAssetURL(asset),
            [ErrorsSymbol]: errors,
        };
    },
    render(h) {
        return h(MainComponent);
    },
});

Vue.config.errorHandler = function(err: Error, vm: Vue, info: string) {
    if (vue.errors.length >= 20) {
        console.error('Already showing 20 errors, supressing additional error', info, err, vm);
        return;
    }

    vue.errors.push({err, vm, info});
};

vue.$mount(document.body.firstElementChild!);

// @ts-ignore
global.client = client;
// @ts-ignore
global.native_hook = native_hook;
// @ts-ignore
global.$root = vue;
// @ts-ignore
global.PluginManager = PluginManager;
// @ts-ignore
global.components = require('./component-registry');
