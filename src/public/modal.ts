if (process.env.NODE_ENV === 'development') {
    require('@vue/devtools');
}

import * as url from 'url';

import './native-hook';

import {NativeHookSymbol, ModalsSymbol, ClientSymbol, GetAssetURLSymbol} from './internal-symbols';
import * as InternalSymbols from './internal-symbols';
import Client from '../client/client';
import Connection from '../client/connection';

import {ServiceTileComponents} from './component-registry';

import Vue from 'vue';
import VueRouter from 'vue-router';
import VueI18n from 'vue-i18n';

Vue.use(VueRouter);
Vue.use(VueI18n);

import Modals from './modals';
import WindowModals from './window-modals';
// @ts-ignore
import ModalComponent from './components/modal.vue';

const router = new VueRouter({
    mode: 'history',
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

const client = new (native_hook && native_hook.Client ? native_hook.Client : Client)(
    undefined, undefined, ServiceTileComponents);
const modals = new (native_hook && native_hook.Modals && native_hook.Modals !== Modals ?
    native_hook.Modals : WindowModals)(client);
modals.i18n = i18n;

const vue = new Vue({
    router,
    i18n,

    provide() {
        return {
            [NativeHookSymbol]: native_hook,
            [ModalsSymbol]: modals,
            [ClientSymbol]: client,
            [GetAssetURLSymbol]: (asset: string) => this.getAssetURL(asset),
        };
    },
    methods: {
        getAssetURL(asset: string) {
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

vue.$mount(document.body.firstElementChild!);

// @ts-ignore
global.client = client;
// @ts-ignore
global.native_hook = native_hook;
// @ts-ignore
global.$root = vue;
