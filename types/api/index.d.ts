import {events} from '@hap-server/hap-server';
import Events, {Event, EventListener, EventListenerPromise, EventListeners} from '@hap-server/hap-server/events';
import * as ServerEvents from '@hap-server/hap-server/events/server';
import Server from '@hap-server/hap-server/server/server';
import Connection from '@hap-server/hap-server/server/connection';
import {
    Plugin,
    PluginAPI,

    AccessoryPlatform as BaseAccessoryPlatform,
    ServerPlugin as BaseServerPlugin,
    WebInterfacePlugin as BaseWebInterfacePlugin,
    AccessoryDiscovery as BaseAccessoryDiscovery,
    DiscoveredAccessory as BaseDiscoveredAccessory,
    AccessorySetup as BaseAccessorySetup,
    AuthenticationHandler as BaseAuthenticationHandler,
    AuthenticatedUser as BaseAuthenticatedUser,
    UserManagementHandler as BaseUserManagementHandler,
} from '@hap-server/hap-server/server/plugins';
import {AccessoryEvents, AccessoryStatus} from '@hap-server/hap-server/server/accessories';
import AutomationTrigger from '@hap-server/hap-server/automations/trigger';
import AutomationCondition from '@hap-server/hap-server/automations/condition';
import AutomationAction from '@hap-server/hap-server/automations/action';
import Logger from '@hap-server/hap-server/common/logger';
import Module from 'module';
import {Accessory} from '@hap-server/hap-server/hap-nodejs';

declare module '@hap-server/api' {
    const pluginapi: PluginAPI;

    export const plugin: Plugin;
    export const parent_module: Module;
    // @ts-ignore
    export default pluginapi;
    export const log: Logger;

    export class AccessoryPlatform extends BaseAccessoryPlatform {
        constructor(server: Server, config: any, cached_accessories: Accessory[]);
    }
    export abstract class ServerPlugin extends BaseServerPlugin {
        constructor(server: Server, config: any);
    }
    export class WebInterfacePlugin extends BaseWebInterfacePlugin {
        constructor();
    }
    export class AccessoryUI extends BaseWebInterfacePlugin {
        constructor();
    }
    export abstract class AccessoryDiscovery extends BaseAccessoryDiscovery {
        constructor(localid?: BaseAccessorySetup | string, setup?: BaseAccessorySetup);
    }
    export class DiscoveredAccessory extends BaseDiscoveredAccessory {
        constructor(data: object, accessory_discovery?: BaseAccessoryDiscovery);
    }
    export class AccessorySetup extends BaseAccessorySetup {
        constructor(plugin: Plugin, name: string, handler: (data: any, connection: Connection) => any);
    }
    export class AuthenticationHandler extends BaseAuthenticationHandler {
        constructor(
            localid: string,
            handler: (data: any, connection: Connection) =>
                Promise<BaseAuthenticatedUser | any> | BaseAuthenticatedUser | any, // eslint-disable-line @typescript-eslint/indent
            disconnect_handler?: (authenticated_user: BaseAuthenticatedUser, disconnected: boolean,
                connection: Connection) => any
        );
    }
    export class AuthenticatedUser extends BaseAuthenticatedUser {
        constructor(id: string, name: string, authentication_handler?: BaseAuthenticationHandler);
    }
    export class UserManagementHandler extends BaseUserManagementHandler {
        constructor(localid: string, handler: (data: any, connection: Connection) => any);
    }

    // @ts-ignore
    export {
        AutomationTrigger,
        AutomationCondition,
        AutomationAction,

        Events,
        Event,
        ServerEvents,
        EventListener,
        EventListenerPromise,
        EventListeners,
        events,

        AccessoryEvents,
        AccessoryStatus,
    };

    export type Connection = import('@hap-server/hap-server/server/connection').default;
}