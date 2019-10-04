import {PluginAPI, UserManagementHandler as BaseUserManagementHandler} from '../../public/plugins';

import Connection, {
    AuthenticationHandlerConnection,
    AuthenticatedUser,

    UserManagementConnection,
    UserManagementUser,

    AccessorySetupConnection,
} from '../../client/connection';
import Service from '../../client/service';
import Characteristic from '../../client/characteristic';

// @ts-ignore
import {DiscoveredAccessory} from '../../public/components/add-accessory.vue';

declare module '@hap-server/ui-api' {
    const plugin_api: PluginAPI;

    export default plugin_api;
    
    export abstract class UserManagementHandler extends BaseUserManagementHandler {
        constructor(/* id, */ connection: Connection);
    }

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
