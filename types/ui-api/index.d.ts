import {PluginAPI, UserManagementHandler as BaseUserManagementHandler} from '@hap-server/hap-server/public/plugins';

import Connection, {
    AuthenticationHandlerConnection,
    AuthenticatedUser,

    UserManagementConnection,
    UserManagementUser,

    AccessorySetupConnection,
} from '@hap-server/hap-server/client/connection';
import Service from '@hap-server/hap-server/client/service';
import Characteristic from '@hap-server/hap-server/client/characteristic';

// @ts-ignore
import {DiscoveredAccessory} from '@hap-server/hap-server/public/components/add-accessory.vue';

declare module '@hap-server/ui-api' {
    const plugin_api: PluginAPI;

    // @ts-ignore
    export default plugin_api;

    export abstract class UserManagementHandler extends BaseUserManagementHandler {
        constructor(/* id, */ connection: Connection);
    }

    // @ts-ignore
    export {
        AuthenticationHandlerConnection,
        AuthenticatedUser,

        UserManagementConnection,
        UserManagementUser,

        AccessorySetupConnection,
        DiscoveredAccessory,

        // Expose Service and Characteristic for Vue prop type checking and the default UUIDs
        Service,
        Characteristic,
    };
}
