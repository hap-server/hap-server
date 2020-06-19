import {Client, Connection} from '../client';
import PluginManager from './plugins';
import Modals from './modals';
import WindowModals from './window-modals';
import * as InternalSymbols from './internal-symbols';

import Vue, {Component} from 'vue';
import VueRouter from 'vue-router';

type VueRouterMode = 'history' | 'hash';

export interface NativeHook {
    Client?: typeof Client;
    Modals?: {new <C = Component>(client: Client): Modals<C>};
    base_url?: string;
    router_mode?: VueRouterMode;
}

export interface NativeHookAPI {
    InternalSymbols: typeof InternalSymbols;
    PluginManager: typeof PluginManager;
    Client: typeof Client;
    Connection: typeof Connection;
    Vue: typeof Vue;
    MainComponent?: Component;
    router?: VueRouter;
    Modals: typeof Modals;
    WindowModals?: typeof WindowModals;
    ModalsComponent?: Component;
    ModalComponent?: Component;
}

export interface NativeHookHandler {
    (api: NativeHookAPI): NativeHook;
}

declare global {
    let __HAP_SERVER_NATIVE_HOOK__: NativeHookHandler | undefined;

    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace NodeJS {
        interface Global {
            __HAP_SERVER_NATIVE_HOOK__: NativeHookHandler | undefined;
        }
    }
}

if (!global.__HAP_SERVER_NATIVE_HOOK__) global.__HAP_SERVER_NATIVE_HOOK__ = undefined;
