if (process.env.NODE_ENV === 'development') {
    require('@vue/devtools');
}

import url from 'url';

import {NativeHookSymbol, ModalsSymbol, ClientSymbol, GetAssetURLSymbol} from './internal-symbols';
import * as InternalSymbols from './internal-symbols';
import Client from '../client/client';
import Connection from '../client/connection';

import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

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
        {name: 'setup', path: '/setup'},
    ],
});

import PluginManager from './plugins';

interface NativeHook {
    Client?: typeof Client;
    Modals?: {new (client: Client): Modals};
    base_url?: string;
    router_mode?: VueRouterMode;
}

// @ts-ignore
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
}) as NativeHook : null;

if (native_hook && native_hook.router_mode !== default_router_mode) {
    // Re-initialise the router using the hash mode
    // @ts-ignore
    router.options.mode = 'hash';
    // @ts-ignore
    router.constructor.call(router, router.options);
}

Object.defineProperty(PluginManager, 'base_url', {
    configurable: true,
    enumerable: true,
    get: () => native_hook && native_hook.base_url || '/',
});

const client = new (native_hook && native_hook.Client ? native_hook.Client : Client)();
const modals = new (native_hook && native_hook.Modals ? native_hook.Modals : Modals)(client);
modals.component = ModalsComponent;

const vue = new Vue({
    router,
    provide() {
        return {
            [NativeHookSymbol]: native_hook,
            [ModalsSymbol]: modals,
            [ClientSymbol]: client,
            [GetAssetURLSymbol]: asset => this.getAssetURL(asset),
        };
    },
    methods: {
        getAssetURL(asset) {
            if (native_hook && native_hook.base_url) {
                return url.resolve(native_hook.base_url, 'assets/' + asset);
            }

            return '/assets/' + asset;
        },
    },
    render(h) {
        return h(MainComponent);
    },
});

vue.$mount(document.body.firstElementChild);

// @ts-ignore
global.client = client;
// @ts-ignore
global.native_hook = native_hook;
// @ts-ignore
global.$root = vue;
