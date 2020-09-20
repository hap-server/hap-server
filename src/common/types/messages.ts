/// <reference path="../../types/hap-nodejs.d.ts" />

import {AccessoryHap, CharacteristicHap} from './hap';
import {
    AccessoryData, Home, Layout, LayoutSection, Automation, Scene, Bridge, Pairing, Permissions, AccessoryType,
} from './storage';
import {Record} from '../../history';
import {AccessoryStatus} from '../../common/types/accessories';
import {SystemInformationData} from '../../server/system-information';

export interface ErrorResponse {
    reject: true;
    error: boolean;
    constructor: string;
    data: {message: string; code: number; stack: string} | any;
}

export interface ListAccessoriesRequestMessage {
    type: 'list-accessories';
}
export type ListAccessoriesResponseMessage = string[];

export interface GetAccessoriesRequestMessage {
    type: 'get-accessories';
    id: string[];
}
export type GetAccessoriesResponseMessage = AccessoryHap[];

export interface GetAccessoriesStatusRequestMessage {
    type: 'get-accessories-status';
    id: string[];
}
export type GetAccessoriesStatusResponseMessage = AccessoryStatus[];

export interface GetAccessoriesConfigurationRequestMessage {
    type: 'get-accessories-configuration';
    id: string[];
}
export interface HomebridgeAccessoryConfigurationResponse {
    is_writable: boolean;
    is_homebridge: true;
}
export interface AccessoryPlatformAccessoryConfigurationResponse {
    is_writable: boolean;
    type: AccessoryType.ACCESSORY_PLATFORM;
    accessory_platform: string;
    plugin_name: string | undefined;
    platform_name: string;
    config: any;
    accessories: string[];
}
export interface StandaloneAccessoryConfigurationResponse {
    is_writable: boolean;
    type: AccessoryType.ACCESSORY;
    plugin: string | undefined;
    accessory: string;
    config: any;
}
export type GetAccessoriesConfigurationResponseMessage =
    (HomebridgeAccessoryConfigurationResponse | AccessoryPlatformAccessoryConfigurationResponse |
    StandaloneAccessoryConfigurationResponse | {is_writable: false})[];

export interface SetAccessoriesConfigurationRequestMessage {
    type: 'set-accessories-configuration';
    id_data: [string, unknown][];
}
export type SetAccessoriesConfigurationResponseMessage = void[];

export interface GetAccessoryPlatformsConfigurationRequestMessage {
    type: 'get-accessory-platforms-configuration';
    id: string[];
}
export type GetAccessoryPlatformsConfigurationResponseMessage = {
    is_writable: boolean;
    can_set: boolean;
    type: AccessoryType.ACCESSORY_PLATFORM;
    config: any;
    accessories: string[];
}[];

export interface SetAccessoryPlatformsConfigurationRequestMessage {
    type: 'set-accessory-platforms-configuration';
    id_data: [string, unknown][];
}
export type SetAccessoryPlatformsConfigurationResponseMessage = void[];

export interface GetAccessoriesPermissionsRequestMessage {
    type: 'get-accessories-permissions';
    id: string[];
}
export type GetAccessoriesPermissionsResponseMessage = {
    get: boolean;
    set: boolean;
    get_config: boolean;
    set_config: boolean;
    set_characteristics: {
        [service_id: string]: string[];
    };
}[];

export interface GetCharacteristicsRequestMessage {
    type: 'get-characteristics';
    ids: [string, string, string][];
}
export type GetCharacteristicsResponseMessage = CharacteristicHap[];

export interface SetCharacteristicsRequestMessage {
    type: 'set-characteristics';
    ids_data: [string, string, string, any][];
}
export type SetCharacteristicsResponseMessage = (void | {status: number})[];

export interface SubscribeCharacteristicsRequestMessage {
    type: 'subscribe-characteristics';
    ids: [string, string, string][];
}
export type SubscribeCharacteristicsResponseMessage = void[];

export interface UnsubscribeCharacteristicsRequestMessage {
    type: 'unsubscribe-characteristics';
    ids: [string, string, string][];
}
export type UnsubscribeCharacteristicsResponseMessage = void[];

export interface RequestSnapshotRequestMessage {
    type: 'request-snapshot';
    id: string;
    request: import('hap-nodejs/lib/Camera').SnapshotRequest;
}
export type RequestSnapshotResponseMessage = Buffer;

export interface GetHistoryRecordsRequestMessage {
    type: 'get-history-records';
    ids_date_range: [string, string, string, string, string][];
}
export type GetHistoryRecordsResponseMessage = Record[][];

export interface GetAccessoriesDataRequestMessage {
    type: 'get-accessories-data';
    id: string[];
}
export type GetAccessoriesDataResponseMessage = AccessoryData[];

export interface SetAccessoriesDataRequestMessage {
    type: 'set-accessories-data';
    id_data: [string, AccessoryData][];
}
export type SetAccessoriesDataResponseMessage = void[];

export interface StartAccessoryDiscoveryRequestMessage {
    type: 'start-accessory-discovery';
}
export type StartAccessoryDiscoveryResponseMessage = void;

export interface GetDiscoveredAccessoriesRequestMessage {
    type: 'get-discovered-accessories';
}
export type GetDiscoveredAccessoriesResponseMessage = {
    plugin: string | null;
    accessory_discovery: number;
    id: number;
    data: any;
}[];

export interface StopAccessoryDiscoveryRequestMessage {
    type: 'stop-accessory-discovery';
}
export type StopAccessoryDiscoveryResponseMessage = void;

export interface CreateAccessoriesRequestMessage {
    type: 'create-accessories';
    data: any[];
}
export type CreateAccessoriesResponseMessage = string[];

export interface CreateAccessoryPlatformsRequestMessage {
    type: 'create-accessory-platforms';
    data: any[];
}
export type CreateAccessoryPlatformsResponseMessage = string[];

export interface DeleteAccessoriesRequestMessage {
    type: 'delete-accessories';
    id: string[];
}
export type DeleteAccessoriesResponseMessage = void[];

export interface DeleteAccessoryPlatformsRequestMessage {
    type: 'delete-accessory-platforms';
    id: string[];
}
export type DeleteAccessoryPlatformsResponseMessage = void[];

export interface GetHomeSettingsRequestMessage {
    type: 'get-home-settings';
}
export type GetHomeSettingsResponseMessage = Home;

export interface GetHomePermissionsRequestMessage {
    type: 'get-home-permissions';
}
export type GetHomePermissionsResponseMessage = {
    get: boolean;
    set: boolean;
    add_accessories: boolean;
    create_layouts: boolean;
    has_automations: boolean;
    create_automations: boolean;
    create_bridges: boolean;
    server: boolean;
    users: boolean;
    permissions: boolean;
    plugins: boolean;
    console: boolean;
};

export interface SetHomeSettingsRequestMessage {
    type: 'set-home-settings';
    data: Home;
}
export type SetHomeSettingsResponseMessage = void;

export interface ListLayoutsRequestMessage {
    type: 'list-layouts';
}
export type ListLayoutsResponseMessage = string[];

export interface CreateLayoutsRequestMessage {
    type: 'create-layouts';
    data: Layout[];
}
export type CreateLayoutsResponseMessage = string[];

export interface GetLayoutsRequestMessage {
    type: 'get-layouts';
    id: string[];
}
export type GetLayoutsResponseMessage = Layout[];

export interface GetLayoutsPermissionsRequestMessage {
    type: 'get-layouts-permissions';
    id: string[];
}
export type GetLayoutsPermissionsResponseMessage = {
    get: boolean;
    set: boolean;
    delete: boolean;
}[];

export interface SetLayoutsRequestMessage {
    type: 'set-layouts';
    id_data: [string, Layout][];
}
export type SetLayoutsResponseMessage = void[];

export interface DeleteLayoutsRequestMessage {
    type: 'delete-layouts';
    id: string[];
}
export type DeleteLayoutsResponseMessage = void[];

export interface ListLayoutSectionsRequestMessage {
    type: 'list-layout-sections';
    id: string[];
}
export type ListLayoutSectionsResponseMessage = string[][];

export interface CreateLayoutSectionsRequestMessage {
    type: 'create-layout-sections';
    id_data: [string, LayoutSection][];
}
export type CreateLayoutSectionsResponseMessage = string[];

export interface GetLayoutSectionsRequestMessage {
    type: 'get-layout-sections';
    ids: [string, string][];
}
export type GetLayoutSectionsResponseMessage = LayoutSection[];

export interface SetLayoutSectionsRequestMessage {
    type: 'set-layout-sections';
    ids_data: [string, string, LayoutSection][];
}
export type SetLayoutSectionsResponseMessage = void[];

export interface DeleteLayoutSectionsRequestMessage {
    type: 'delete-layout-sections';
    ids: [string, string][];
}
export type DeleteLayoutSectionsResponseMessage = void[];

export interface ListAutomationsRequestMessage {
    type: 'list-automations';
}
export type ListAutomationsResponseMessage = string[];

export interface CreateAutomationsRequestMessage {
    type: 'create-automations';
    data: Automation[];
}
export type CreateAutomationsResponseMessage = string[];

export interface GetAutomationsRequestMessage {
    type: 'get-automations';
    id: string[];
}
export type GetAutomationsResponseMessage = Automation[];

export interface GetAutomationsPermissionsRequestMessage {
    type: 'get-automations-permissions';
    id: string[];
}
export type GetAutomationsPermissionsResponseMessage = {
    get: boolean;
    set: boolean;
    delete: boolean;
}[];

export interface SetAutomationsRequestMessage {
    type: 'set-automations';
    id_data: [string, Automation][];
}
export type SetAutomationsResponseMessage = void[];

export interface DeleteAutomationsRequestMessage {
    type: 'delete-automations';
    id: string[];
}
export type DeleteAutomationsResponseMessage = void[];

export interface ListScenesRequestMessage {
    type: 'list-scenes';
}
export type ListScenesResponseMessage = string[];

export interface CreateScenesRequestMessage {
    type: 'create-scenes';
    data: Scene[];
}
export type CreateScenesResponseMessage = string[];

export interface GetScenesRequestMessage {
    type: 'get-scenes';
    id: string[];
}
export type GetScenesResponseMessage = Scene[];

export interface GetScenesPermissionsRequestMessage {
    type: 'get-scenes-permissions';
    id: string[];
}
export type GetScenesPermissionsResponseMessage = {
    get: boolean;
    activate: boolean;
    set: boolean;
    delete: boolean;
}[];

export interface SetScenesRequestMessage {
    type: 'set-scenes';
    id_data: [string, Scene][];
}
export type SetScenesResponseMessage = void[];

export interface CheckScenesActiveRequestMessage {
    type: 'check-scenes-active';
    id: string[];
}
export type CheckScenesActiveResponseMessage = (boolean | ErrorResponse)[];

export interface ActivateScenesRequestMessage {
    type: 'activate-scenes';
    id_data: [string, any][];
}
export type ActivateScenesResponseMessage = void[];

export interface DeactivateScenesRequestMessage {
    type: 'deactivate-scenes';
    id_data: [string, any][];
}
export type DeactivateScenesResponseMessage = void[];

export interface DeleteScenesRequestMessage {
    type: 'delete-scenes';
    id: string[];
}
export type DeleteScenesResponseMessage = void[];

export interface GetCommandLineFlagsRequestMessage {
    type: 'get-command-line-flags';
}
export type GetCommandLineFlagsResponseMessage = string[];

export interface EnableProxyStdoutRequestMessage {
    type: 'enable-proxy-stdout';
}
export type EnableProxyStdoutResponseMessage = void;

export interface DisableProxyStdoutRequestMessage {
    type: 'disable-proxy-stdout';
}
export type DisableProxyStdoutResponseMessage = void;

export interface GetSystemInformationRequestMessage {
    type: 'get-system-information';
}
export type GetSystemInformationResponseMessage = SystemInformationData;

export interface SubscribeSystemInformationRequestMessage {
    type: 'subscribe-system-information';
}
export type SubscribeSystemInformationResponseMessage = void;

export interface UnsubscribeSystemInformationRequestMessage {
    type: 'unsubscribe-system-information';
}
export type UnsubscribeSystemInformationResponseMessage = void;

export interface ListBridgesRequestMessage {
    type: 'list-bridges';
    include_homebridge?: boolean;
}
export type ListBridgesResponseMessage = string[];

export interface CreateBridgesRequestMessage {
    type: 'create-bridges';
    data: Bridge[];
}
export type CreateBridgesResponseMessage = string[];

export interface GetBridgesRequestMessage {
    type: 'get-bridges';
    uuid: string[];
}
export type GetBridgesResponseMessage = {
    uuid: string;
    accessory_uuids: string[];
}[];

export interface GetBridgesConfigurationRequestMessage {
    type: 'get-bridges-configuration';
    uuid: string[];
}
export type GetBridgesConfigurationResponseMessage = Bridge[];

export interface GetBridgesPermissionsRequestMessage {
    type: 'get-bridges-permissions';
    uuid: string[];
}
export type GetBridgesPermissionsResponseMessage = {
    get: boolean;
    set: boolean;
    delete: boolean;
    is_from_config: boolean;
}[];

export interface SetBridgesConfigurationRequestMessage {
    type: 'set-bridges-configuration';
    uuid_data: [string, Bridge][];
}
export type SetBridgesConfigurationResponseMessage = void[];

export interface DeleteBridgesRequestMessage {
    type: 'delete-bridges';
    uuid: string[];
}
export type DeleteBridgesResponseMessage = void[];

export interface GetBridgesPairingDetailsRequestMessage {
    type: 'get-bridges-pairing-details';
    bridge_uuid: string;
}
export type GetBridgesPairingDetailsResponseMessage = {
    username: string;
    pincode: string;
    url: string;
}[];

export interface ResetBridgesPairingsRequestMessage {
    type: 'reset-bridges-pairings';
    bridge_uuid: string;
}
export type ResetBridgesPairingsResponseMessage = void[];

export interface ListPairingsRequestMessage {
    type: 'list-pairings';
    bridge_uuid: string;
}
export type ListPairingsResponseMessage = string[];

export interface GetPairingsRequestMessage {
    type: 'get-pairings';
    ids: [string, string][];
}
export type GetPairingsResponseMessage = {
    bridge_uuid: string;
    id: string;
    public_key: string;
}[];

export interface GetPairingsDataRequestMessage {
    type: 'get-pairings-data';
    id: string[];
}
export type GetPairingsDataResponseMessage = Pairing[];

export interface GetPairingsPermissionsRequestMessage {
    type: 'get-pairings-permissions';
    id: string[];
}
export type GetPairingsPermissionsResponseMessage = {
    get: boolean;
    set: boolean;
}[];

export interface SetPairingsDataRequestMessage {
    type: 'set-pairings-data';
    id_data: [string, Pairing][];
}
export type SetPairingsDataResponseMessage = void[];

export interface UIPlugin {
    id: number;
    /** The plugin that registered the UI plugin */
    plugin: string;
    scripts: string[];

    // Maps names to IDs
    plugin_authentication_handlers: {[localid: string]: number};
    plugin_user_management_handlers: {[localid: string]: number};
    plugin_accessory_discovery_handlers: {[localid: string]: number};
    plugin_accessory_discovery_handler_setup_handlers: {[localid: string]: number};
    plugin_accessory_setup_handlers: {[localid: string]: number};
}

export interface GetWebInterfacePluginsRequestMessage {
    type: 'get-web-interface-plugins';
}
export type GetWebInterfacePluginsResponseMessage = UIPlugin[];

export type AuthenticateRequestMessage = {
    type: 'authenticate';
    authentication_handler_id: number;
    data: any;
} | {
    type: 'authenticate';
    token: string;
} | {
    type: 'authenticate';
    cli_token: string;
} | {
    type: 'authenticate';
    setup_token: string;
};
export type AuthenticateResponseMessage = {
    success: true;
    data: any;
    user_id: string;
    token?: string;
    authentication_handler_id?: number;
    asset_token?: string;
} | {
    success: false;
    data: any;
};

export interface UserManagementRequestMessage {
    type: 'user-management';
    user_management_handler_id: number;
    data: any;
}
export type UserManagementResponseMessage = any;

export interface GetUsersPermissionsRequestMessage {
    type: 'get-users-permissions';
    id: string[];
}
export type GetUsersPermissionsResponseMessage = Permissions[];

export interface SetUsersPermissionsRequestMessage {
    type: 'set-users-permissions';
    id_data: [string, Permissions][];
}
export type SetUsersPermissionsResponseMessage = void[];

export interface AccessorySetupRequestMessage {
    type: 'accessory-setup';
    accessory_setup_id: number;
    data: any;
}
export type AccessorySetupResponseMessage = any;

export interface OpenConsoleRequestMessage {
    type: 'open-console';
}
export type OpenConsoleResponseMessage = number;

export interface CloseConsoleRequestMessage {
    type: 'close-console';
    id: number;
}
export type CloseConsoleResponseMessage = void;

export interface ConsoleInputRequestMessage {
    type: 'console-input';
    id: number;
    data: string;
}
export type ConsoleInputResponseMessage = void;

export interface DefinedRequestResponseMessages {
    'list-accessories': [ListAccessoriesRequestMessage, ListAccessoriesResponseMessage];
    'get-accessories': [GetAccessoriesRequestMessage, GetAccessoriesResponseMessage];
    'get-accessories-status': [GetAccessoriesStatusRequestMessage, GetAccessoriesStatusResponseMessage];
    'get-accessories-configuration': [
        GetAccessoriesConfigurationRequestMessage, GetAccessoriesConfigurationResponseMessage,
    ];
    'set-accessories-configuration': [
        SetAccessoriesConfigurationRequestMessage, SetAccessoriesConfigurationResponseMessage,
    ];
    'get-accessory-platforms-configuration': [
        GetAccessoryPlatformsConfigurationRequestMessage, GetAccessoryPlatformsConfigurationResponseMessage,
    ];
    'set-accessory-platforms-configuration': [
        SetAccessoryPlatformsConfigurationRequestMessage, SetAccessoryPlatformsConfigurationResponseMessage,
    ];
    'get-accessories-permissions': [GetAccessoriesPermissionsRequestMessage, GetAccessoriesPermissionsResponseMessage];
    'get-characteristics': [GetCharacteristicsRequestMessage, GetCharacteristicsResponseMessage];
    'set-characteristics': [SetCharacteristicsRequestMessage, SetCharacteristicsResponseMessage];
    'subscribe-characteristics': [SubscribeCharacteristicsRequestMessage, SubscribeCharacteristicsResponseMessage];
    'unsubscribe-characteristics': [
        UnsubscribeCharacteristicsRequestMessage, UnsubscribeCharacteristicsResponseMessage,
    ];
    'request-snapshot': [RequestSnapshotRequestMessage, RequestSnapshotResponseMessage];
    'get-history-records': [GetHistoryRecordsRequestMessage, GetHistoryRecordsResponseMessage];
    'get-accessories-data': [GetAccessoriesDataRequestMessage, GetAccessoriesDataResponseMessage];
    'set-accessories-data': [SetAccessoriesDataRequestMessage, SetAccessoriesDataResponseMessage];

    'start-accessory-discovery': [StartAccessoryDiscoveryRequestMessage, StartAccessoryDiscoveryResponseMessage];
    'get-discovered-accessories': [GetDiscoveredAccessoriesRequestMessage, GetDiscoveredAccessoriesResponseMessage];
    'stop-accessory-discovery': [StopAccessoryDiscoveryRequestMessage, StopAccessoryDiscoveryResponseMessage];
    'create-accessories': [CreateAccessoriesRequestMessage, CreateAccessoriesResponseMessage];
    'create-accessory-platforms': [CreateAccessoryPlatformsRequestMessage, CreateAccessoryPlatformsResponseMessage];
    'delete-accessories': [DeleteAccessoriesRequestMessage, DeleteAccessoriesResponseMessage];
    'delete-accessory-platforms': [DeleteAccessoryPlatformsRequestMessage, DeleteAccessoryPlatformsResponseMessage];

    'get-home-settings': [GetHomeSettingsRequestMessage, GetHomeSettingsResponseMessage];
    'get-home-permissions': [GetHomePermissionsRequestMessage, GetHomePermissionsResponseMessage];
    'set-home-settings': [SetHomeSettingsRequestMessage, SetHomeSettingsResponseMessage];

    'list-layouts': [ListLayoutsRequestMessage, ListLayoutsResponseMessage];
    'create-layouts': [CreateLayoutsRequestMessage, CreateLayoutsResponseMessage];
    'get-layouts': [GetLayoutsRequestMessage, GetLayoutsResponseMessage];
    'get-layouts-permissions': [GetLayoutsPermissionsRequestMessage, GetLayoutsPermissionsResponseMessage];
    'set-layouts': [SetLayoutsRequestMessage, SetLayoutsResponseMessage];
    'delete-layouts': [DeleteLayoutsRequestMessage, DeleteLayoutsResponseMessage];

    'list-layout-sections': [ListLayoutSectionsRequestMessage, ListLayoutSectionsResponseMessage];
    'create-layout-sections': [CreateLayoutSectionsRequestMessage, CreateLayoutSectionsResponseMessage];
    'get-layout-sections': [GetLayoutSectionsRequestMessage, GetLayoutSectionsResponseMessage];
    'set-layout-sections': [SetLayoutSectionsRequestMessage, SetLayoutSectionsResponseMessage];
    'delete-layout-sections': [DeleteLayoutSectionsRequestMessage, DeleteLayoutSectionsResponseMessage];

    'list-automations': [ListAutomationsRequestMessage, ListAutomationsResponseMessage];
    'create-automations': [CreateAutomationsRequestMessage, CreateAutomationsResponseMessage];
    'get-automations': [GetAutomationsRequestMessage, GetAutomationsResponseMessage];
    'get-automations-permissions': [GetAutomationsPermissionsRequestMessage, GetAutomationsPermissionsResponseMessage];
    'set-automations': [SetAutomationsRequestMessage, SetAutomationsResponseMessage];
    'delete-automations': [DeleteAutomationsRequestMessage, DeleteAutomationsResponseMessage];

    'list-scenes': [ListScenesRequestMessage, ListScenesResponseMessage];
    'create-scenes': [CreateScenesRequestMessage, CreateScenesResponseMessage];
    'get-scenes': [GetScenesRequestMessage, GetScenesResponseMessage];
    'get-scenes-permissions': [GetScenesPermissionsRequestMessage, GetScenesPermissionsResponseMessage];
    'set-scenes': [SetScenesRequestMessage, SetScenesResponseMessage];
    'check-scenes-active': [CheckScenesActiveRequestMessage, CheckScenesActiveResponseMessage];
    'activate-scenes': [ActivateScenesRequestMessage, ActivateScenesResponseMessage];
    'deactivate-scenes': [DeactivateScenesRequestMessage, DeactivateScenesResponseMessage];
    'delete-scenes': [DeleteScenesRequestMessage, DeleteScenesResponseMessage];

    'get-command-line-flags': [GetCommandLineFlagsRequestMessage, GetCommandLineFlagsResponseMessage];
    'enable-proxy-stdout': [EnableProxyStdoutRequestMessage, EnableProxyStdoutResponseMessage];
    'disable-proxy-stdout': [DisableProxyStdoutRequestMessage, DisableProxyStdoutResponseMessage];
    'get-system-information': [GetSystemInformationRequestMessage, GetSystemInformationResponseMessage];
    'subscribe-system-information': [
        SubscribeSystemInformationRequestMessage, SubscribeSystemInformationResponseMessage,
    ];
    'unsubscribe-system-information': [
        UnsubscribeSystemInformationRequestMessage, UnsubscribeSystemInformationResponseMessage,
    ];

    'list-bridges': [ListBridgesRequestMessage, ListBridgesResponseMessage];
    'create-bridges': [CreateBridgesRequestMessage, CreateBridgesResponseMessage];
    'get-bridges': [GetBridgesRequestMessage, GetBridgesResponseMessage];
    'get-bridges-configuration': [GetBridgesConfigurationRequestMessage, GetBridgesConfigurationResponseMessage];
    'get-bridges-permissions': [GetBridgesPermissionsRequestMessage, GetBridgesPermissionsResponseMessage];
    'set-bridges-configuration': [SetBridgesConfigurationRequestMessage, SetBridgesConfigurationResponseMessage];
    'delete-bridges': [DeleteBridgesRequestMessage, DeleteBridgesResponseMessage];

    'get-bridges-pairing-details': [GetBridgesPairingDetailsRequestMessage, GetBridgesPairingDetailsResponseMessage];
    'reset-bridges-pairings': [ResetBridgesPairingsRequestMessage, ResetBridgesPairingsResponseMessage];
    'list-pairings': [ListPairingsRequestMessage, ListPairingsResponseMessage];
    'get-pairings': [GetPairingsRequestMessage, GetPairingsResponseMessage];
    'get-pairings-data': [GetPairingsDataRequestMessage, GetPairingsDataResponseMessage];
    'get-pairings-permissions': [GetPairingsPermissionsRequestMessage, GetPairingsPermissionsResponseMessage];
    'set-pairings-data': [SetPairingsDataRequestMessage, SetPairingsDataResponseMessage];

    'get-web-interface-plugins': [GetWebInterfacePluginsRequestMessage, GetWebInterfacePluginsResponseMessage];
    'authenticate': [AuthenticateRequestMessage, AuthenticateResponseMessage];
    'user-management': [UserManagementRequestMessage, UserManagementResponseMessage];
    'get-users-permissions': [GetUsersPermissionsRequestMessage, GetUsersPermissionsResponseMessage];
    'set-users-permissions': [SetUsersPermissionsRequestMessage, SetUsersPermissionsResponseMessage];
    'accessory-setup': [AccessorySetupRequestMessage, AccessorySetupResponseMessage];

    'open-console': [OpenConsoleRequestMessage, OpenConsoleResponseMessage];
    'close-console': [CloseConsoleRequestMessage, CloseConsoleResponseMessage];
    'console-input': [ConsoleInputRequestMessage, ConsoleInputResponseMessage];
}

export type MessageTypes = keyof DefinedRequestResponseMessages;

export type RequestResponseMessages = DefinedRequestResponseMessages;

export type DefinedRequestMessages = {
    [T in keyof DefinedRequestResponseMessages]: DefinedRequestResponseMessages[T][0];
};
export type RequestMessages = DefinedRequestMessages;

export type DefinedResponseMessages = {
    [T in keyof DefinedRequestResponseMessages]: DefinedRequestResponseMessages[T][1];
};
export type ResponseMessages = DefinedResponseMessages;

export type RequestMessage = DefinedRequestMessages[keyof DefinedRequestMessages];
export type ProgressMessage = never;
export type ResponseMessage = DefinedResponseMessages[keyof DefinedResponseMessages];

export type OptionalDataRequestMessages = {
    [T in MessageTypes]: {type: T; [key: string]: T | never} extends RequestMessages[T] ? RequestMessages[T] : never;
}[MessageTypes];
export type OptionalDataMessageTypes = OptionalDataRequestMessages['type'];
