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

import Modals from './modals';
import WindowModals from './window-modals';
import ModalComponent from './components/modal.vue';

const router = new VueRouter({
    mode: 'history',
});

import PluginManager from './plugins';

const native_hook = global.__HAP_SERVER_NATIVE_HOOK__ ? global.__HAP_SERVER_NATIVE_HOOK__({
    InternalSymbols,
    PluginManager,
    Client,
    Connection,
    Vue,
    Modals,
    WindowModals,
    ModalComponent,
}) : null;

Object.defineProperty(PluginManager, 'base_url', {
    configurable: true,
    enumerable: true,
    get: () => native_hook && native_hook.base_url || '/',
});

const client = new (native_hook && native_hook.Client ? native_hook.Client : Client)();
const modals = new (native_hook && native_hook.Modals && native_hook.Modals !== Modals ?
    native_hook.Modals : WindowModals)(client);

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
        return h(ModalComponent);
    },
});

vue.$mount(document.body.firstElementChild);

global.client = client;
global.native_hook = native_hook;
global.$root = vue;
