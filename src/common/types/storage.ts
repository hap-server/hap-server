import {
    AutomationTriggerConfiguration,
    AutomationConditionConfiguration,
    AutomationActionConfiguration,
    BridgeConfiguration,
} from '../../cli/configuration';

export type TLSCertificateUUID = string;

export type HasCompletedSetup = boolean;

export interface Home {
    name?: string;
    background_url?: string;
}

export type Layouts = string[];

export interface Layout {
    name?: string;
    background_url?: string;
    sections_order?: string[];
}

export type LayoutSections = string[];

export interface LayoutSection {
    type?: string;
    name?: string;
    accessories?: string[];
}

export type Automations = string[];

export interface Automation {
    name?: string;
    triggers?: {
        [id: string]: AutomationTriggerConfiguration;
    };
    conditions?: {
        [id: string]: AutomationConditionConfiguration;
    };
    actions?: {
        [id: string]: AutomationActionConfiguration;
    };
}

export type Scenes = string[];

export interface Scene {
    name?: string;
    conditions?: {
        [id: string]: AutomationConditionConfiguration;
    };
    enable_actions?: {
        [id: string]: AutomationActionConfiguration;
    };
    disable_actions?: {
        [id: string]: AutomationActionConfiguration;
    };
}

export interface ServiceData {
    name?: string;
    room_name?: string;
}

export interface AccessoryData {
    // Service.* and CollapsedService.*
    [key: string]: ServiceData | string;

    // @ts-ignore
    name?: string;
    // @ts-ignore
    room_name?: string;
}

export interface Pairing {
    name?: string;
}

export interface BaseCachedAccessory {
    accessory: {
        displayName: string;
        UUID: string;
        services: {
            displayName: string;
            UUID: string;
            subtype?: string;
            characteristics: {
                displayName: string;
                UUID: string;
                value?: any;
                status?: number;
                eventOnlyCharacteristic: boolean;
                props: any;
            }[];
            optionalCharacteristics: {
                displayName: string;
                UUID: string;
                value?: any;
                status?: number;
                eventOnlyCharacteristic: boolean;
                props: any;
            }[];
        }[];
        external_groups?: string[];
    };

    plugin: string | null;
    uuid: string;
    is_homebridge: boolean;
    data: any;
    bridge_uuids: string[];
    bridge_uuids_external: string[];
}

export interface CachedHomebridgeAccessory extends BaseCachedAccessory {
    plugin: null;
    is_homebridge: true;
}

export interface CachedStandaloneAccessory extends BaseCachedAccessory {
    is_homebridge: false;
    accessory_type: string;
}

export interface CachedAccessoryPlatformAccessory extends BaseCachedAccessory {
    is_homebridge: false;
    base_uuid: string;
    accessory_platform: string;
}

export type CachedAccessory = CachedHomebridgeAccessory | CachedStandaloneAccessory | CachedAccessoryPlatformAccessory;

export type CachedAccessories = CachedAccessory[];

export type Bridges = string[];

export interface Bridge extends BridgeConfiguration {
    uuid: never;
}

export type OUI = string;

export interface Session {
    authentication_handler: string;
    authentication_handler_plugin: string;
    authenticated_user: {
        id: string;
        [key: string]: any;
    };
}

export interface AccessoryPermissions {
    readonly get?: boolean;
    readonly set?: boolean;
    readonly config?: boolean;
    readonly manage?: boolean;
    readonly delete?: boolean;
}

export interface LayoutPermissions {
    readonly get?: boolean;
    readonly set?: boolean;
    readonly delete?: boolean;
}

export interface AutomationPermissions {
    readonly get?: boolean;
    readonly set?: boolean;
    readonly delete?: boolean;
}

export interface ScenePermissions {
    readonly get?: boolean;
    readonly set?: boolean;
    readonly activate?: boolean;
    readonly delete?: boolean;
}

export interface Permissions {
    readonly '*'?: boolean;
    readonly get_home_settings?: boolean;
    readonly set_home_settings?: boolean;
    readonly create_accessories?: boolean;
    readonly create_layouts?: boolean;
    readonly create_automations?: boolean;
    readonly create_scenes?: boolean;
    readonly create_bridges?: boolean;
    readonly manage_pairings?: boolean;
    readonly server_runtime_info?: boolean;
    readonly manage_users?: boolean;
    readonly manage_permissions?: boolean;
    readonly web_console?: boolean;
    readonly accessories?: {readonly [key: string]: AccessoryPermissions};
    readonly layouts?: {readonly [key: string]: LayoutPermissions};
    readonly automations?: {readonly [key: string]: AutomationPermissions};
    readonly scenes?: {readonly [key: string]: ScenePermissions};
}

export default interface StorageTypes {
    TLSCertificateUUID: TLSCertificateUUID;
    HasCompletedSetup: HasCompletedSetup;
    Home: Home;
    Layouts: Layouts;
    'Layout.': Layout;
    'LayoutSections.': LayoutSections;
    'LayoutSection.': LayoutSection;
    Automations: Automations;
    'Automation.': Automation;
    Scenes: Scenes;
    'Scene.': Scene;
    'AccessoryData.': AccessoryData;
    'Pairing.': Pairing;
    CachedAccessories: CachedAccessories;
    Bridges: Bridges;
    'Bridge.': Bridge;
    OUI: OUI;
    'Session.': Session;
    'Permissions.': Permissions;
}
