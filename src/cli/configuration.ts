
import {parseAddress, addressToString, normaliseAddress} from './server';

import * as path from 'path';
import {promises as fs, statSync} from 'fs';
import * as process from 'process';
import * as os from 'os';

import * as hap from 'hap-nodejs';

const DEVELOPMENT = true;

export interface HomebridgeBridgeConfiguration {
    name?: string;
    username: string;
    port?: number;
    pin?: string;
}

export interface HomebridgeAccessoryConfiguration {
    accessory: string;
    name: string;
    uuid_base?: string;

    [key: string]: any;
}

export interface HomebridgePlatformConfiguration {
    platform: string;
    name?: string;

    [key: string]: any;
}

export interface BridgeConfiguration {
    name?: string;
    uuid?: string;
    username: string;
    port?: number;
    pincode?: string;
    unauthenticated_access?: boolean;
    accessories?: Array<string | [string, string, string] | ['homebridge', null, string]>;
}

export interface AccessoryConfiguration {
    plugin?: string;
    accessory: string;
    name: string;
    uuid?: string;

    [key: string]: any;
}

export interface AccessoryPlatformConfiguration {
    plugin?: string;
    platform: string;
    name: string;
    uuid?: string;

    [key: string]: any;
}

export interface AutomationTriggerConfiguration {
    plugin?: string;
    trigger: string;

    [key: string]: any;
}

export interface AutomationConditionConfiguration {
    plugin?: string;
    condition: string;

    [key: string]: any;
}

export interface AutomationActionConfiguration {
    plugin?: string;
    action: string;

    [key: string]: any;
}

export interface AutomationConfiguration {
    triggers?: string[];
    conditions?: string[];
    actions?: string[];
}

type Includes<T> = string | {include: string} | T;

type NetAddressType = 'net';
type UnixSocketAddressType = 'unix';

type ListenAddress = number | string | [NetAddressType, string, number] | [UnixSocketAddressType, string];

export interface ConfigurationFile {
    hostname?: string;

    'data-path'?: string;
    'plugin-path'?: string | string[];

    listen?: number | string | ListenAddress[];
    'listen-https'?: {[key: string]: string | string[]};
    'listen-https+request-client-certificate'?: string[] | {[key: string]: string | string[]};
    'listen-https+require-client-certificate'?: {[key: string]: string | string[]};
    'listen-https+crl'?: string[] | {[key: string]: string};
    'listen-https+passphrase'?: string[] | {[key: string]: string};

    plugins?: {
        [key: string]: any;
    };

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

    /** @deprecated */
    http_host?: string;
}

interface Configuration {
    hostname?: string;

    'data-path'?: string;
    'plugin-path'?: string | string[];

    listen?: number | string | ListenAddress[];
    'listen-https'?: {[key: string]: string | string[]};
    'listen-https+request-client-certificate'?: string[] | {[key: string]: string | string[]};
    'listen-https+require-client-certificate'?: {[key: string]: string | string[]};
    'listen-https+crl'?: string[] | {[key: string]: string};
    'listen-https+passphrase'?: string[] | {[key: string]: string};

    plugins?: {
        [key: string]: any;
    };

    bridge?: HomebridgeBridgeConfiguration;
    accessories?: HomebridgeAccessoryConfiguration[];
    platforms?: HomebridgePlatformConfiguration[];

    bridges?: BridgeConfiguration[];
    accessories2?: AccessoryConfiguration[];
    platforms2?: AccessoryPlatformConfiguration[];

    'automation-triggers'?: {[key: string]: AutomationTriggerConfiguration};
    'automation-conditions'?: {[key: string]: AutomationConditionConfiguration};
    'automation-actions'?: {[key: string]: AutomationActionConfiguration};
    automations?: AutomationConfiguration[];

    /** @deprecated */
    http_host?: string;
}

export default Configuration;

const validkeys = [
    'hostname', 'data-path', 'plugin-path',
    'listen', 'listen-https', 'listen-https+request-client-certificate', 'listen-https+require-client-certificate',
    'listen-https+crl', 'listen-https+passphrase',
    'plugins',
    'bridge', 'accessories', 'platforms',
    'bridges', 'accessories2', 'platforms2',
    'automation-triggers', 'automation-conditions', 'automation-actions',
    'automations',

    // Deprecated
    'http_host',
];

const validhomebridgebridgekeys = [
    'name', 'username', 'port', 'pin',
];
const validbridgekeys = [
    'name', 'uuid', 'username', 'port', 'pincode',
    'unauthenticated_access', 'accessories',
];
const disallowedsetupcodes = [
    '000-00-000', '111-11-111', '222-22-222', '333-33-333', '444-44-444', '555-55-555', '666-66-666', '777-77-777',
    '888-88-888', '999-99-999', '123-45-678', '876-54-321',
];

export class Warning extends Error {
    constructor(message?: string) {
        super(message);

        if (this.stack) {
            this.stack = 'Warning' + this.stack.substr(5);
        }
    }

    toString() {
        return 'Warning: ' + this.message;
    }
}

/**
 * @param {ConfigurationFile} configuration Configuration *after* resolving includes
 * @param {string} [base_path] Path to resolve paths in the configuration data
 * @return {Promise<Error[]>}
 */
export async function validate(configuration: ConfigurationFile, base_path: string): Promise<Error[]> {
    const errors: (Error | Warning)[] = [];

    for (const key of Object.keys(configuration)) {
        if (validkeys.includes(key)) continue;

        errors.push(new Warning(`Unknown key ${key}`));
    }

    if (typeof configuration.hostname !== 'undefined') {
        if (typeof configuration.hostname !== 'string') {
            errors.push(new Error('hostname must be a string'));
        }
    }

    if (typeof configuration['data-path'] !== 'undefined') {
        if (typeof configuration['data-path'] !== 'string') {
            errors.push(new Error('data-path must be a string'));
        } else if (!await isdir(configuration['data-path'])) {
            errors.push(new Error('data-path doesn\'t exist or is not a directory'));
        }
    }

    if (typeof configuration['plugin-path'] !== 'undefined') {
        if (typeof configuration['plugin-path'] === 'string') {
            if (!await isdir(path.resolve(base_path, configuration['plugin-path']))) {
                errors.push(new Error('plugin-path doesn\'t exist or is not a directory'));
            }
        // eslint-disable-next-line curly, guard-for-in
        } else if (configuration['plugin-path'] instanceof Array) for (const i in configuration['plugin-path']) {
            const _path = configuration['plugin-path'][i];
            if (typeof _path !== 'string') {
                errors.push(new Error('plugin-path must be a string or an array of string'));
            } else if (!await isdir(path.resolve(base_path, _path))) {
                errors.push(new Error(`plugin-path[${i}] doesn't exist or is not a directory`));
            }
        } else {
            errors.push(new Error('plugin-path must be a string or an array of strings'));
        }
    }

    const listen_addresses = [];

    if (typeof configuration.listen !== 'undefined') {
        // eslint-disable-next-line curly, guard-for-in
        if (configuration.listen instanceof Array) for (const i in configuration.listen) {
            const listen = configuration.listen[i];
            try {
                listen_addresses.push(listen instanceof Array ? listen : normaliseAddress(listen, base_path));
            } catch (err) {
                errors.push(new Error(`listen[${i}] must be a valid address`));
            }
        } else {
            try {
                listen_addresses.push(normaliseAddress(configuration.listen, base_path));
            } catch (err) {
                // @ts-ignore
                errors.push(new Error('listen must be a valid address', err));
            }
        }
    }

    if (typeof configuration['listen-https'] !== 'undefined') {
        // eslint-disable-next-line curly
        if (typeof configuration['listen-https'] === 'object' && configuration['listen-https'] !== null
        ) for (const [listen, https] of Object.entries(configuration['listen-https'])) {
            let normalised;
            try {
                normalised = normaliseAddress(listen, base_path);
            } catch (err) {
                // @ts-ignore
                errors.push(new Warning(`listen-https keys must be valid addresses (${listen} is not valid)`, err));
                continue;
            }

            if (!listen_addresses.includes(normalised)) {
                errors.push(new Warning(`${listen} is not used as a listening address but has a HTTPS configuration`));
            }

            // eslint-disable-next-line curly, guard-for-in
            if (https instanceof Array) for (const i in https) {
                const certificate = https[i];
                if (typeof certificate !== 'string') {
                    errors.push(new Error(`listen-https[${listen}][${i}] must be a string`));
                } else if (!await isfile(certificate)) {
                    errors.push(new Error(`listen-https[${listen}][${i}] doesn't exist or is not a file`));
                }
            } else if (typeof https !== 'string') {
                errors.push(new Error(`listen-https[${listen}] must be a string or an array of strings`));
            } else if (!await isfile(https)) {
                errors.push(new Error(`listen-https[${listen}] doesn't exist or is not a file`));
            }
        } else {
            errors.push(new Error('listen-https must be an object'));
        }
    }

    if (typeof configuration['listen-https+request-client-certificate'] !== 'undefined') {
        // eslint-disable-next-line curly
        if (typeof configuration['listen-https+request-client-certificate'] === 'object' &&
            configuration['listen-https+request-client-certificate'] !== null
        ) for (const [listen, https] of Object.entries(configuration['listen-https+request-client-certificate'])) {
            let normalised;
            try {
                normalised = normaliseAddress(listen, base_path);
            } catch (err) {
                errors.push(new Warning('listen-https+request-client-certificate keys must be valid addresses ' +
                    // @ts-ignore
                    `(${listen} is not valid)`, err));
                continue;
            }

            if (!listen_addresses.includes(normalised)) {
                errors.push(new Warning(`${listen} is not used as a listening address but has a HTTPS ` +
                    'request-client-certificate configuration'));
            }

            // eslint-disable-next-line curly, guard-for-in
            if (https instanceof Array) for (const i in https) {
                const certificate = https[i];
                if (typeof certificate !== 'string') {
                    errors.push(new Error(`listen-https+request-client-certificate[${listen}][${i}] must be a string`));
                } else if (!await isfile(certificate)) {
                    errors.push(new Error(`listen-https+request-client-certificate[${listen}][${i}] doesn't exist or ` +
                        'is not a file'));
                }
            } else if (typeof https !== 'string') {
                errors.push(new Error(`listen-https+request-client-certificate[${listen}] must be a string or an ` +
                    'array of strings'));
            } else if (!await isfile(https)) {
                errors.push(new Error(`listen-https+request-client-certificate[${listen}] doesn't exist or is not ` +
                    'a file'));
            }
        } else {
            errors.push(new Error('listen-https+request-client-certificate must be an object'));
        }
    }

    if (typeof configuration['listen-https+require-client-certificate'] !== 'undefined') {
        // eslint-disable-next-line curly
        if (typeof configuration['listen-https+require-client-certificate'] === 'object' &&
            configuration['listen-https+require-client-certificate'] !== null
        ) for (const [listen, https] of Object.entries(configuration['listen-https+require-client-certificate'])) {
            let normalised;
            try {
                normalised = normaliseAddress(listen, base_path);
            } catch (err) {
                errors.push(new Warning('listen-https+require-client-certificate keys must be valid addresses ' +
                    // @ts-ignore
                    `(${listen} is not valid)`, err));
                continue;
            }

            if (!listen_addresses.includes(normalised)) {
                errors.push(new Warning(`${listen} is not used as a listening address but has a HTTPS ` +
                    'require-client-certificate configuration'));
            }

            // eslint-disable-next-line curly, guard-for-in
            if (https instanceof Array) for (const i in https) {
                const certificate = https[i];
                if (typeof certificate !== 'string') {
                    errors.push(new Error(`listen-https+require-client-certificate[${listen}][${i}] must be a string`));
                } else if (!await isfile(certificate)) {
                    errors.push(new Error(`listen-https+require-client-certificate[${listen}][${i}] doesn't exist or ` +
                        'is not a file'));
                }
            } else if (typeof https !== 'string') {
                errors.push(new Error(`listen-https+require-client-certificate[${listen}] must be a string or an ` +
                    'array of strings'));
            } else if (!await isfile(https)) {
                errors.push(new Error(`listen-https+require-client-certificate[${listen}] doesn't exist or is not ` +
                    'a file'));
            }
        } else {
            errors.push(new Error('listen-https+require-client-certificate must be an object'));
        }
    }

    if (typeof configuration['listen-https+crl'] !== 'undefined') {
        // eslint-disable-next-line curly
        if (typeof configuration['listen-https+crl'] === 'object' && configuration['listen-https+crl'] !== null
        ) for (const [listen, crl] of Object.entries(configuration['listen-https+crl'])) {
            let normalised;
            try {
                normalised = normaliseAddress(listen, base_path);
            } catch (err) {
                // @ts-ignore
                errors.push(new Warning(`listen-https+crl keys must be valid addresses (${listen} is not valid)`, err));
                continue;
            }

            if (!listen_addresses.includes(normalised)) {
                errors.push(new Warning(`${listen} is not used as a listening address but has a HTTPS ` +
                    'CRL configuration'));
            }

            if (typeof crl !== 'string') {
                errors.push(new Error(`listen-https+crl[${listen}] must be a string`));
            }
        } else {
            errors.push(new Error('listen-https+crl must be an object'));
        }
    }

    if (typeof configuration['listen-https+passphrase'] !== 'undefined') {
        // eslint-disable-next-line curly
        if (typeof configuration['listen-https+passphrase'] === 'object' &&
            configuration['listen-https+passphrase'] !== null
        ) for (const [listen, passphrase] of Object.entries(configuration['listen-https+passphrase'])) {
            let normalised;
            try {
                normalised = normaliseAddress(listen, base_path);
            } catch (err) {
                errors.push(new Warning('listen-https+passphrase keys must be valid addresses ' +
                    // @ts-ignore
                    `(${listen} is not valid)`, err));
                continue;
            }

            if (!listen_addresses.includes(normalised)) {
                errors.push(new Warning(`${listen} is not used as a listening address but has a HTTPS ` +
                    'passphrase configuration'));
            }

            if (typeof passphrase !== 'string') {
                errors.push(new Error(`listen-https+passphrase[${listen}] must be a string`));
            }
        } else {
            errors.push(new Error('listen-https+passphrase must be an object'));
        }
    }

    // TODO: validate plugins configuration

    const bridge_uuids: string[] = [];
    const bridge_usernames = [];

    if (typeof configuration.bridge !== 'undefined') {
        if (typeof configuration.bridge === 'object' && configuration.bridge !== null) {
            for (const key of Object.keys(configuration.bridge)) {
                if (validhomebridgebridgekeys.includes(key)) continue;

                errors.push(new Warning(`Unknown key bridge[${key}]`));
            }

            if (typeof configuration.bridge.name !== 'undefined') {
                if (typeof configuration.bridge.name !== 'string') {
                    errors.push(new Error('bridge.name must be a string'));
                }
            }

            if (typeof configuration.bridge.username !== 'undefined') {
                if (typeof configuration.bridge.username !== 'string') {
                    errors.push(new Error('bridge.username must be a string'));
                } else if (!configuration.bridge.username.match(/^([0-9a-f]{2}\:){5}[0-9a-f]{2}$/i)) {
                    errors.push(new Error('bridge.username must be formatted as a MAC address'));
                }
            }

            bridge_usernames.push(configuration.bridge.username.toLowerCase() || 'cc:22:3d:e3:ce:30');

            if (typeof configuration.bridge.port !== 'undefined') {
                if (typeof configuration.bridge.port !== 'number') {
                    errors.push(new Error('bridge.port must be a number'));
                } else if (configuration.bridge.port % 1 !== 0 || configuration.bridge.port < 0 ||
                    configuration.bridge.port > 65565
                ) {
                    errors.push(new Error('bridge.port must be a valid port number'));
                }
            }

            if (typeof configuration.bridge.pin !== 'undefined') {
                if (typeof configuration.bridge.pin !== 'string') {
                    errors.push(new Error('bridge.pin must be a string'));
                } else if (!configuration.bridge.pin.match(/^[0-9]{3}-[0-9]{2}-[0-9]{3}$/)) {
                    errors.push(new Error('bridge.pin must be formatted as a HomeKit setup code'));
                } else if (disallowedsetupcodes.includes(configuration.bridge.pin)) {
                    errors.push(new Error('bridge.pin must not be a disallowed HomeKit setup code'));
                }
            }
        } else {
            errors.push(new Error('bridge must be an object'));
        }
    }

    // TODO: validate Homebridge accessories and platforms configuration

    if (typeof configuration.bridges !== 'undefined') {
        // eslint-disable-next-line curly, guard-for-in
        if (configuration.bridges instanceof Array) for (const i in configuration.bridges) {
            const bridge = configuration.bridges[i] as BridgeConfiguration;

            if (typeof bridge !== 'object') {
                errors.push(new Error(`bridges[${i}] must be an object`));
                continue;
            }

            for (const key of Object.keys(bridge)) {
                if (validbridgekeys.includes(key)) continue;

                errors.push(new Warning(`Unknown key bridges[${i}][${key}]`));
            }

            if (typeof bridge.name !== 'undefined') {
                if (typeof bridge.name !== 'string') {
                    errors.push(new Error(`bridges[${i}].name must be a string`));
                }
            }

            if (typeof bridge.uuid !== 'undefined') {
                if (typeof bridge.uuid !== 'string') {
                    errors.push(new Error(`bridges[${i}].uuid must be a string`));
                }
            }

            if (typeof bridge.username !== 'undefined') {
                if (typeof bridge.username !== 'string') {
                    errors.push(new Error(`bridges[${i}].username must be a string`));
                } else if (!bridge.username.match(/^([0-9a-f]{2}\:){5}[0-9a-f]{2}$/i)) {
                    errors.push(new Error(`bridges[${i}].username must be formatted as a MAC address`));
                }
            }

            if (typeof bridge.uuid !== 'string' && typeof bridge.username !== 'string') {
                errors.push(new Error(`bridges[${i}] has no UUID or username`));
            }

            const username = bridge.username.toLowerCase() || 'cc:22:3d:e3:ce:30';
            const uuid = bridge.uuid || hap.uuid.generate('hap-server:bridge:' + username);

            if (bridge_uuids.includes(uuid)) {
                errors.push(new Error(`bridges[${i}] has a duplicate UUID`));
            }
            if (bridge_usernames.includes(username)) {
                errors.push(new Error(`bridges[${i}] has a duplicate username`));
            }

            bridge_uuids.push(uuid);
            bridge_uuids.push(username);

            if (typeof bridge.port !== 'undefined') {
                if (typeof bridge.port !== 'number') {
                    errors.push(new Error(`bridges[${i}].port must be a number`));
                } else if (bridge.port % 1 !== 0 || bridge.port < 0 || bridge.port > 65565) {
                    errors.push(new Error(`bridges[${i}].port must be a valid port number`));
                }
            }

            if (typeof bridge.pincode !== 'undefined') {
                if (typeof bridge.pincode !== 'string') {
                    errors.push(new Error(`bridges[${i}].pincode must be a string`));
                } else if (!bridge.pincode.match(/^[0-9]{3}-[0-9]{2}-[0-9]{3}$/)) {
                    errors.push(new Error(`bridges[${i}].pincode must be formatted as a HomeKit setup code`));
                } else if (disallowedsetupcodes.includes(bridge.pincode)) {
                    errors.push(new Error(`bridges[${i}].pincode must not be a disallowed HomeKit setup code`));
                }
            }

            if (typeof bridge.unauthenticated_access !== 'undefined') {
                if (typeof bridge.unauthenticated_access !== 'boolean') {
                    errors.push(new Error(`bridges[${i}].pincode must be a boolean`));
                }

                if (bridge.unauthenticated_access) {
                    errors.push(new Warning(`bridges[${i}].unauthenticated_access is true. Anyone will be able to ` +
                        'connect to this bridge.'));
                }
            }

            if (typeof bridge.accessories !== 'undefined') {
                // eslint-disable-next-line curly, guard-for-in
                if (bridge.accessories instanceof Array) for (const ai in bridge.accessories) {
                    const accessory_uuid = bridge.accessories[ai];

                    if (typeof accessory_uuid === 'string') {
                        // TODO: validate UUID
                    } else if (accessory_uuid instanceof Array) {
                        if (accessory_uuid.length !== 3) {
                            errors.push(new Error(`bridges[${i}].accessories[${ai}] must have three items`));
                            continue;
                        }

                        if (typeof accessory_uuid[0] !== 'string') {
                            errors.push(new Error(`bridges[${i}].accessories[${ai}][0] must be a string`));
                        }
                        if ((accessory_uuid[0] === 'homebridge' && accessory_uuid[1] !== null) &&
                            typeof accessory_uuid[1] !== 'string'
                        ) {
                            errors.push(new Error(`bridges[${i}].accessories[${ai}][1] must be a string (or if ` +
                                `bridges[${i}].accessories[${ai}][0] is "homebridge", null)`));
                        }
                        if (typeof accessory_uuid[2] !== 'string') {
                            errors.push(new Error(`bridges[${i}].accessories[${ai}][2] must be a string`));
                        }
                    } else {
                        errors.push(new Error(`bridges[${i}].accessories[${ai}] must be a string or an array`));
                    }
                } else {
                    errors.push(new Error(`bridges[${i}].accessories must be an array`));
                }
            }

            if (!(bridge.accessories instanceof Array) || !bridge.accessories.length) {
                errors.push(new Warning(`bridges[${i}].accessories is empty. This bridge won't have any accessories.`));
            }
        } else {
            errors.push(new Error('bridges must be an array'));
        }
    }

    // TODO: validate hap-server accessories and platforms configuration
    // TODO: validate hap-server automations configuration

    if (typeof configuration.http_host !== 'undefined') {
        errors.push(new Warning('http_host is deprecated. Use listen instead.'));

        if (typeof configuration.http_host !== 'string') {
            errors.push(new Error('http_host must be a string'));
        }
    }

    return errors;
}

const default_data_paths: {
    [K in NodeJS.Platform]?: string[];
} = {
    darwin: [
        path.join(os.homedir(), 'Library', 'Application Support', 'hap-server'),
        path.join(os.homedir(), '.homebridge'),
        path.join('/', 'Library', 'Application Support', 'hap-server'),
    ],
    linux: [
        path.join(os.homedir(), '.config', 'hap-server'),
        path.join(os.homedir(), '.homebridge'),
        path.join('/', 'var', 'lib', 'hap-server'),
    ],
};

export function getDefaultDataPaths(platform = process.platform, _default?: string[]) {
    if (DEVELOPMENT && !default_data_paths[platform] && _default) {
        return [path.join(__dirname, '..', '..', 'data'), ..._default!];
    }

    if (!default_data_paths[platform] && _default) return _default;
    if (!default_data_paths[platform]) throw new Error('Unknown platform');

    if (DEVELOPMENT) {
        return [path.join(__dirname, '..', '..', 'data'), ...default_data_paths[platform]!];
    }

    return default_data_paths[platform]!;
}

export function getDefaultDataPath(platform = process.platform, _default?: string[]) {
    const paths = getDefaultDataPaths(platform, _default);

    for (const pathname of paths) {
        if (isdirSync(pathname)) return pathname;
    }

    // If none exist use the first
    return paths[0];
}

const default_config_paths = [
    'config.yaml',
    'config.yml',
    'config.json',
];

export function getDefaultConfigPath(platform = process.platform, _default?: string[]) {
    const data_path = getDefaultDataPath(platform, _default);

    for (const config_path of default_config_paths) {
        const pathname = path.join(data_path, config_path);
        if (isfileSync(pathname)) return pathname;
    }

    // If none exist use the first
    return path.join(data_path, default_config_paths[0]);
}

async function isdir(path: string) {
    try {
        const stat = await fs.stat(path);

        if (!stat.isDirectory()) return false;
    } catch (err) {
        return false;
    }

    return true;
}

function isdirSync(path: string) {
    try {
        const stat = statSync(path);

        if (!stat.isDirectory()) return false;
    } catch (err) {
        return false;
    }

    return true;
}

async function isfile(path: string) {
    try {
        const stat = await fs.stat(path);

        if (!stat.isFile()) return false;
    } catch (err) {
        return false;
    }

    return true;
}

function isfileSync(path: string) {
    try {
        const stat = statSync(path);

        if (!stat.isFile()) return false;
    } catch (err) {
        return false;
    }

    return true;
}
