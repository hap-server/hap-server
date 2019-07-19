interface HomebridgeBridgeConfiguration {
    name?: string;
    username: string;
    port?: number;
    pin?: string;
}

interface HomebridgeAccessoryConfiguration {
    accessory: string;
    name: string;
    uuid_base?: string;

    [key: string]: any;
}

interface HomebridgePlatformConfiguration {
    platform: string;
    name?: string;

    [key: string]: any;
}

interface BridgeConfiguration {
    name?: string;
    uuid?: string;
    username: string;
    port?: number;
    pincode?: string;
    unauthenticated_access?: boolean;
    accessories?: Array<string | [string, string, string] | ['homebridge', null, string]>;
}

interface AccessoryConfiguration {
    plugin: string;
    accessory: string;
    name: string;
    uuid?: string;

    [key: string]: any;
}

interface AccessoryPlatformConfiguration {
    plugin: string;
    platform: string;
    name: string;
    uuid?: string;

    [key: string]: any;
}

interface AutomationTriggerConfiguration {
    plugin: string;
    trigger: string;

    [key: string]: any;
}

interface AutomationConditionConfiguration {
    plugin: string;
    condition: string;

    [key: string]: any;
}

interface AutomationActionConfiguration {
    plugin: string;
    action: string;

    [key: string]: any;
}

interface AutomationConfiguration {
    triggers?: string[];
    conditions?: string[];
    actions?: string[];
}

type Includes<T> = string | {include: string} | T;

interface ConfigurationFile {
    'data-path'?: string;
    'plugin-path'?: string | string[];

    listen?: string[];
    'listen-https'?: {[key: string]: string};
    'listen-https+request-client-certificate'?: string[] | {[key: string]: string};
    'listen-https+require-client-certificate'?: {[key: string]: string};
    'listen-https+crl'?: string[] | {[key: string]: string};
    'listen-https+passphrase'?: string[] | {[key: string]: string};

    bridge?: HomebridgeBridgeConfiguration;
    accessories?: HomebridgeAccessoryConfiguration[];
    platforms?: HomebridgePlatformConfiguration[];

    bridges?: Includes<BridgeConfiguration>[];
    accessories2?: Includes<AccessoryConfiguration>[];
    platforms2?: Includes<AccessoryPlatformConfiguration>[];

    'automation-triggers'?: {[key: string]: Includes<AutomationTriggerConfiguration>};
    'automation-conditions'?: {[key: string]: Includes<AutomationConditionConfiguration>};
    'automation-actions'?: {[key: string]: Includes<AutomationActionConfiguration>};
    automations?: AutomationConfiguration[];

    http_host?: string;
}

export default ConfigurationFile;
