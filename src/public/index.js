if (process.env.NODE_ENV === 'development') {
    require('@vue/devtools');
}

import {ClientSymbol} from './internal-symbols';
import Client from '../common/client';
import Connection from '../common/connection';

import Vue from 'vue';
import MainComponent from './components/main-component.vue';

const client = new (global.__HAP_SERVER_NATIVE_HOOK__ ? global.__HAP_SERVER_NATIVE_HOOK__({
    Client,
    Connection,
    Vue,
    MainComponent,
}) : Client)();

const vue = new Vue({
    provide() {
        return {
            [ClientSymbol]: client,
        };
    },
    render(h) {
        return h(MainComponent);
    },
});

vue.$mount(document.body.firstElementChild);
