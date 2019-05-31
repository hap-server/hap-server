if (process.env.NODE_ENV === 'development') {
    require('@vue/devtools');
}

import {ClientSymbol} from './internal-symbols';
import Client from '../common/client';
import Connection from '../common/connection';

import Vue from 'vue';
import MainComponent from './components/main-component.vue';

import PluginManager from './plugins';

const native_hook = global.__HAP_SERVER_NATIVE_HOOK__ ? global.__HAP_SERVER_NATIVE_HOOK__({
    PluginManager,
    Client,
    Connection,
    Vue,
    MainComponent,
}) : null;

Object.defineProperty(PluginManager, 'base_url', {
    configurable: true,
    enumerable: true,
    get: () => native_hook && native_hook.base_url || '',
});

const client = new (native_hook ? native_hook.Client : Client)();

const vue = new Vue({
    provide() {
        return {
            native_hook,
            [ClientSymbol]: client,
        };
    },
    render(h) {
        return h(MainComponent);
    },
});

vue.$mount(document.body.firstElementChild);

global.client = client;
global.native_hook = native_hook;
global.$root = vue;
