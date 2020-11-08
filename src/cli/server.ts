/// <reference path="../types/xkcd-password.d.ts" />

import * as path from 'path';
import * as process from 'process';
import * as os from 'os';
import {promises as fs} from 'fs';
import * as crypto from 'crypto';
import * as util from 'util';
import * as net from 'net';
import * as http from 'http';

import {User as HomebridgeUser} from 'homebridge/lib/user';
import {Logger as HomebridgeLogger} from 'homebridge/lib/logger';
import {HAPStorage} from 'hap-nodejs';
import * as hap from 'hap-nodejs';

import isEqual = require('lodash.isequal');

import {Server, PluginManager, Logger, forceColourLogs, events} from '..';
import {
    ServerStartupFinishedEvent, ServerStoppingEvent, ServerPluginRegisteredEvent,
    AddAccessoryEvent, RemoveAccessoryEvent, UpdateAccessoryConfigurationEvent,
} from '../events/server';
import {getConfig, log, GlobalArguments} from '.';
import ConfigurationFile, {
    getDefaultConfigPath,
    BridgeConfiguration, AccessoryConfiguration, AccessoryPlatformConfiguration,
} from './configuration';
import {PluginStandaloneAccessory} from '../server/accessories';

const randomBytes = util.promisify(crypto.randomBytes);

const DEVELOPMENT = true;

export const command = '$0 [config]';
export const describe = 'Run the HAP and web server';

export function builder(yargs: typeof import('yargs')) {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: getDefaultConfigPath(process.platform, [
            path.join(os.homedir(), '.homebridge'),
        ]),
    });

    yargs.option('advertise-web-interface', {
        describe: 'Automatically setup a HTTP server with a self signed TLS certificate for the web interface and ' +
            'advertise it through Bonjour',
        type: 'boolean',
        default: false,
    });
    yargs.option('advertise-web-interface-port', {
        describe: 'Port to listen on for the automatically advertised web interface',
        type: 'number',
        default: 51820,
    });

    yargs.option('data-path', {
        alias: 'U',
        aliases: ['user-storage-path', 'U'],
        describe: 'Path to store data',
        type: 'string',
    });
    yargs.option('plugin-path', {
        alias: 'P',
        describe: 'Additional paths to look for plugins at as well as the default location' +
            ' ([path] can also point to a single plugin)',
        type: 'array',
    });

    yargs.option('print-setup', {
        alias: 'Q',
        aliases: ['qrcode', 'Q'],
        describe: 'Print setup information',
        type: 'boolean',
        default: false,
    });
    yargs.option('allow-unauthenticated', {
        alias: 'I',
        aliases: ['insecure', 'I'],
        describe: 'Allow unauthenticated requests (for easier hacking)',
        type: 'boolean',
        default: false,
    });

    yargs.option('enable-homebridge', {
        describe: 'Whether to enable Homebridge plugins (can be disabled for development for faster startup)',
        type: 'boolean',
        default: true,
    });
    yargs.option('enable-automations', {
        describe: 'Whether to enable automations',
        type: 'boolean',
        default: true,
    });
    yargs.option('enable-hap', {
        describe: 'Whether to enable HomeKit Accessory Protocol servers',
        type: 'boolean',
        default: true,
    });

    yargs.option('experimental-history', {
        describe: 'Experimental history support',
        type: 'boolean',
        default: false,
    });

    yargs.option('user', {
        alias: 'u',
        describe: 'User to run as after starting',
    });
    yargs.option('group', {
        alias: 'g',
        describe: 'Group to run as after starting',
    });

    if (DEVELOPMENT) {
        yargs.option('vue-devtools-host', {
            describe: 'Host to connect to Vue.js devtools with',
            type: 'string',
            default: '127.0.0.1',
        });
        yargs.option('vue-devtools-port', {
            describe: 'Port to connect to Vue.js devtools with',
            type: 'number',
        });
        yargs.option('webpack-hot', {
            describe: 'Enable webpack hot module replacement',
            type: 'boolean',
            default: true,
        });
    }
}

/**
 * Returns an array with a full address (and port number?) from a string.
 *
 * @param {(string|number)} address
 * @param {string} [base_path]
 * @return {Array}
 */
export function parseAddress(address: string | number, base_path: string): Address {
    let match;

    if (typeof address === 'number' || address.match(/^\d+$/)) {
        return ['net', '::', parseInt('' + address)];
    } else if ((match = address.match(/^([0-9.]+):(\d+)$/)) && net.isIPv4(match[1])) {
        return ['net', match[1], parseInt(match[2])];
    } else if ((match = address.match(/^\[([0-9a-f:.]+)\]:(\d+)$/i)) && net.isIPv6(match[1])) {
        return ['net', match[1], parseInt(match[2])];
    } else if (address.startsWith('unix:')) {
        return ['unix', path.resolve(base_path, address.substr(5))];
    } else if (address.startsWith('./') || address.startsWith('../') || address.startsWith('/')) {
        return ['unix', path.resolve(base_path, address)];
    }

    throw new Error('Invalid address string');
}

/**
 * Returns a string from an array returned by parseAddress.
 *
 * @param {Array} address
 * @return {string}
 */
export function addressToString(address: Address) {
    if (address[0] === 'net' && net.isIPv4(address[1])) {
        return `${address[1]}:${address[2]}`;
    } else if (address[0] === 'net' && net.isIPv6(address[1])) {
        return `[${address[1]}]:${address[2]}`;
    } else if (address[0] === 'unix') {
        return `unix:${address[1]}`;
    }

    throw new Error('Invalid address array');
}

export function normaliseAddress(address: Address | string | number, base_path: string) {
    return addressToString(typeof address === 'object' ? address : parseAddress(address, base_path));
}

type Address = ['net', string, number] | ['unix', string];

/**
 * Returns an array of certificates.
 *
 * @param {(string|string[])} certificates
 * @param {string} [base_path]
 * @return {Promise<string[]>}
 */
function getCertificates(certificates: string | [string, string], base_path: string) {
    return Promise.all(([] as string[]).concat(certificates || []).map(async certificate => {
        if (certificate.startsWith('-----')) return certificate;

        return fs.readFile(path.resolve(base_path, certificate), 'utf-8') as Promise<string>;
    }));
}

interface Arguments extends GlobalArguments {
    config: string;

    advertiseWebInterface: boolean;
    advertiseWebInterfacePort: number;

    dataPath?: string;
    pluginPath?: string[];

    printSetup: boolean;
    allowUnauthenticated: boolean;

    enableHomebridge: boolean;
    enableAutomations: boolean;
    enableHap: boolean;

    experimentalHistory: boolean;

    user?: string;
    group?: string;

    // Development
    vueDevtoolsHost: string;
    vueDevtoolsPort?: string;
    webpackHot: boolean;
}

interface AddressOptions {
    middleware?: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
}
interface HttpsOptions {
    allow_unencrypted?: boolean;
}

type ListenAddresses =
    (['net', string, number] | ['unix', string] |
    ['net', string, number, AddressOptions | undefined] | ['unix', string, AddressOptions | undefined])[];
type HttpsAddresses = Record<string, string | [string, string] | [string, string, HttpsOptions]>;

export async function handler(argv: Arguments) {
    if (DEVELOPMENT && argv.vueDevtoolsPort) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {enableVueDevtools} = require('../server/connection');
        enableVueDevtools(argv.vueDevtoolsHost, argv.vueDevtoolsPort);
    }

    const {config, config_path, data_path} = await getConfig(argv);

    const hap_storage_path = path.join(data_path, 'persist');
    HAPStorage.setCustomStoragePath(hap_storage_path);

    HomebridgeUser.setStoragePath(data_path);
    HomebridgeUser.configPath = () => config_path;

    /**
     * Flags.
     */

    HomebridgeLogger.setDebugEnabled(Logger.enable_debug = argv.debug);
    HomebridgeLogger.setTimestampEnabled(Logger.enable_timestamps = argv.timestamps);
    if (argv.forceColour) HomebridgeLogger.forceColor(), forceColourLogs();

    for (const plugin_path of argv.pluginPath || []) {
        PluginManager.addPluginPath(path.resolve(process.cwd(), plugin_path));
    }

    if (typeof config['plugin-path'] === 'string') {
        PluginManager.addPluginPath(path.resolve(path.dirname(config_path), config['plugin-path']));
    } else if (config['plugin-path'] instanceof Array) {
        for (const plugin_path of config['plugin-path']) {
            PluginManager.addPluginPath(path.resolve(path.dirname(config_path), plugin_path));
        }
    }

    if (!argv.enableHap) {
        const {default: HAPServer} = await import('../server/hap-server');

        HAPServer.prototype.start = () => {};
        HAPServer.prototype.stop = () => {};
    }

    /**
     * Run the HAP and web server.
     */

    log.info('Starting hap-server with configuration file', config_path);
    log.info('Arguments', argv);
    log.debug('Data path:', data_path);
    log.debug('hap-nodejs storage path:', hap_storage_path);
    log.debug('UI storage path:', path.resolve(data_path, 'ui-storage'));
    log.debug('Plugin paths:', PluginManager.plugin_paths);
    log.debug('Plugin storage path:', path.resolve(data_path, 'plugin-storage'));
    log.debug('Homebridge accessory cache path:', HomebridgeUser.cachedAccessoryPath());

    PluginManager.storage_path = path.resolve(data_path, 'plugin-storage');
    await PluginManager.loadPlugins();

    const cli_auth_token_bytes = await randomBytes(48);
    const cli_auth_token = cli_auth_token_bytes.toString('hex');

    await fs.writeFile(path.join(data_path, 'cli-token'), cli_auth_token_bytes);
    await fs.writeFile(path.join(data_path, 'hap-server.pid'), '' + process.pid);

    const server = await Server.createServer({
        hostname: config.hostname,
        data_path,
        cli_auth_token,

        // @ts-ignore
        webpack_hot: DEVELOPMENT && argv.webpackHot,
    });

    await server.loadPlugins();
    events.on(ServerPluginRegisteredEvent, event => {
        server.loadPlugin(event.server_plugin);
    });

    (async () => {
        log.info('Cleaning assets directory');
        const stat = await server.cleanAssets();
        log.info('Cleaned assets directory, removed', stat.deleted_assets.length, 'unused assets', stat);
    })().catch(err => log.error('Error cleaning assets directory', err));

    log.info('Starting web server');

    const listen_addresses: ListenAddresses = // eslint-disable-line @typescript-eslint/indent
        ([] as (string | number | ['net', string, number] | ['unix', string])[])
            .concat(config.listen || []).map(a => a instanceof Array ? a as Address : parseAddress(a, data_path));
    const https_addresses: HttpsAddresses = {};
    for (const [address, certificate] of Object.entries(config['listen-https'] || {})) {
        https_addresses[normaliseAddress(address, data_path)] = certificate as any;
    }
    const https_request_client_certificate_addresses: Record<string, string | string[] | boolean> = {};
    for (const [address, certificate] of config['listen-https+request-client-certificate'] instanceof Array ?
        config['listen-https+request-client-certificate']
            .map(address => [address, true] as [string | Address, boolean]) :
        Object.entries(config['listen-https+request-client-certificate'] || {})
    ) {
        https_request_client_certificate_addresses[normaliseAddress(address, data_path)] = certificate;
    }
    const https_require_client_certificate_addresses: Record<string, string | string[]> = {};
    for (const [address, certificate] of Object.entries(config['listen-https+require-client-certificate'] || {})) {
        https_require_client_certificate_addresses[normaliseAddress(address, data_path)] = certificate;
    }
    const https_address_crls: Record<string, string> = {};
    for (const [address, crl] of Object.entries(config['listen-https+crl'] || {})) {
        https_address_crls[normaliseAddress(address, data_path)] = crl;
    }
    const https_address_passphrases: Record<string, string> = {};
    for (const [address, passphrase] of Object.entries(config['listen-https+passphrase'] || {})) {
        https_address_passphrases[normaliseAddress(address, data_path)] = passphrase;
    }

    let [bonjour_instance, web_interface_address] = argv.advertiseWebInterface ?
        await enableAdvertising(argv, server, data_path, listen_addresses, https_addresses) :
        [null, null];

    if (!config.listen && !listen_addresses.length) {
        log.warn('No listening addresses - using a random port');
        listen_addresses.push(['net', '::', 0]);
    }

    log.info('Listen addresses', listen_addresses, https_addresses, https_request_client_certificate_addresses,
        https_require_client_certificate_addresses);
    const listening_servers: net.Server[] = [];
    let wrote_port_file = false;

    for (const address of listen_addresses) {
        const options = typeof address[address.length - 1] === 'object' ? address.pop() as AddressOptions : null;
        const address_string = addressToString(address as Address);
        const https = https_addresses[address_string];
        const https_options = https && typeof https[https.length - 1] === 'object' ?
            (https as HttpsOptions[]).pop() : null;
        const https_request_client_certificate = https_request_client_certificate_addresses[address_string];
        const https_require_client_certificate = https_require_client_certificate_addresses[address_string];
        const https_crl = https_address_crls[address_string];
        const https_passphrase = https_address_passphrases[address_string];

        const http_server = https ? server.createSecureServer({
            ca: https_require_client_certificate || https_request_client_certificate ?
                // @ts-ignore
                await getCertificates(https_require_client_certificate || https_request_client_certificate, data_path) :
                undefined,
            cert: (await getCertificates(https as string | [string, string], data_path))
                .filter(c => (c as string).match(/CERTIFICATE/i)),
            key: (await getCertificates(https as string | [string, string], data_path))
                .filter(c => c.match(/PRIVATE KEY/i)).join('\n'),
            crl: await getCertificates(https_crl, data_path),
            passphrase: https_passphrase,

            requestCert: !!https_request_client_certificate || !!https_require_client_certificate,
            rejectUnauthorized: !!https_require_client_certificate,
        }, options && options.middleware) : server.createServer(null, options && options.middleware);
        const listening_server: net.Server =
        https && https_options && https_options.allow_unencrypted ? net.createServer(connection => {
            const data = connection.read(1);
            if (!data) return connection.once('readable', () => listening_server.emit('connection', connection));
            const first_byte = data[0];
            connection.unshift(data);
            if (first_byte < 32 || first_byte >= 127) {
                http_server.emit('connection', connection);
            } else {
                http_server.emit('secureConnection', connection);
            }
        }) : http_server;

        if (address[0] === 'net') {
            await new Promise((rs, rj) => listening_server.listen(address[2], address[1], () => rs()));

            // @ts-ignore
            const http_port: number = listening_server.address().port;
            log.info(`Listening on ${address[1]} port ${http_port}`);

            if (address[1] === '::' && !wrote_port_file) {
                await fs.writeFile(path.join(data_path, 'hap-server-port'), '' + http_port);
                wrote_port_file = true;
            }
        } else if (address[0] === 'unix') {
            try {
                await fs.unlink(address[1]);
            } catch (err) {}
            await new Promise((rs, rj) => listening_server.listen(address[1], () => rs()));

            log.info(`Listening on UNIX socket ${address[1]}`);
        }

        listening_servers.push(listening_server);
    }

    log.info('Loading cached accessories');
    await server.loadCachedAccessories(true);

    log.info('Loading HAP bridges');
    await server.loadBridgesFromConfig(config.bridges || []);
    await server.loadBridgesFromStorage();

    if (!argv.enableHomebridge) {
        log.info('Not loading Homebridge as it was disabled on the command line');
    } else if (config.bridge) {
        log.info('Loading Homebridge');

        server.accessories.loadHomebridge({
            // @ts-ignore
            bridge: config.bridge,
            accessories: config.accessories || [],
            platforms: config.platforms || [],
        });

        // Always publish Homebridge's HAP server as Homebridge cannot be started otherwise
        server.accessories.homebridge!.publish();
    }

    for (const bridge of server.accessories.bridges) {
        bridge.unauthenticated_access = argv.allowUnauthenticated;
    }

    if (argv.enableHap) {
        log.info('Publishing HAP services');
        await server.publish();
    }

    log.info('Loading accessories and accessory platforms');
    await Promise.all([
        server.loadAccessoriesFromConfig(config.accessories2 || []),
        server.loadAccessoryPlatformsFromConfig(config.platforms2 || []),
        server.accessories.loadAccessoriesFromStorage(true),
    ]);

    log.info('Loading automations');
    await server.loadAutomationsFromConfig({
        automations: config.automations || [],
        'automation-triggers': config['automation-triggers'] || {},
        'automation-conditions': config['automation-conditions'] || {},
        'automation-actions': config['automation-actions'] || {},
    });
    await server.loadAutomationsFromStorage();
    await server.loadScenesFromStorage();

    if (server.accessories.homebridge) {
        // @ts-expect-error
        if (!server.accessories.homebridge.bridge._server?.httpServer.tcpServer.listening) {
            log.info('Waiting for Homebridge to finish loading');
            await new Promise<number>(rs => server.accessories.homebridge!.bridge.once('listening', rs));
        }

        log.info('Loading accessories from Homebridge');
        await server.accessories.loadHomebridgeAccessories();
    }

    log.info('Saving cached accessories');
    await server.saveCachedAccessories();

    function saveCachedAccessories(
        event: AddAccessoryEvent | UpdateAccessoryConfigurationEvent | RemoveAccessoryEvent
    ) {
        log.info('Saving cached accessories');
        server.saveCachedAccessories();
    }
    server.on(AddAccessoryEvent, saveCachedAccessories);
    server.on(UpdateAccessoryConfigurationEvent, saveCachedAccessories);
    server.on(RemoveAccessoryEvent, saveCachedAccessories);

    if (argv.enableAutomations) {
        log.info('Starting automations');
        await server.automations.start();
    }

    if (argv.experimentalHistory) {
        log.info('Starting history');
        await server.loadHistory(path.join(data_path, 'history'));
    }

    if (argv.user || argv.group) log.info('Setting uid/gid');
    if (argv.group) process.setgid(argv.group);
    if (argv.user) process.setuid(argv.user);

    server.emit(ServerStartupFinishedEvent, server);

    log.info('Running', server.accessories.accessories.length, 'accessories',
        server.accessories.cached_accessories.length, 'cached accessories');

    for (const bridge of server.accessories.bridges) {
        log.info('Bridge', bridge.name, bridge.bridge.bridgedAccessories.length, 'accessories',
            bridge.cached_accessories.length, 'cached accessories');

        // Save the identifier cache in case any new accessories/services/characteristics have been added or expired
        bridge.expireUnusedIDs();

        // Bridge has already been paired with
        if (bridge.bridge._accessoryInfo && bridge.bridge._accessoryInfo.pairedClients.length) continue;

        if (argv.printSetup) bridge.printSetupInfo();
    }

    if (!await server.storage.getItem('HasCompletedSetup')) {
        // const password = new (require('xkcd-password'))();
        const XkcdPassword = await import('xkcd-password');
        const password = new XkcdPassword();

        const setup_token = await password.generate({
            numWords: 4,
            minLength: 5,
            maxLength: 8,
        });
        server.setup_token = setup_token.join(' ');

        if (web_interface_address) {
            log.info('Setup hap-server in the web interface at %s',
                `${web_interface_address}setup?token=${setup_token.join('%20')}`);
        } else {
            log.info('Setup hap-server in the web interface with the setup token %s', setup_token.join(' '));
        }
    }

    let exit_attempts = 0;

    for (const [signal, code] of [
        ['SIGINT', 2],
        ['SIGTERM', 15],
    ]) {
        process.on(signal as any, async () => {
            exit_attempts++;

            if (exit_attempts >= 3) {
                log.info(`Got ${signal} (x${exit_attempts}), exiting...`);
                throw process.exit(128 + (code as number));
            } else if (exit_attempts > 1) {
                log.info(`Got ${signal} (x${exit_attempts} - ${3 - exit_attempts} left to force exit),` +
                    + ' shutting down...');
            } else log.info(`Got ${signal}, shutting down...`);

            server.emit(ServerStoppingEvent, server);

            if (bonjour_instance) {
                await new Promise(rs => bonjour_instance!.unpublishAll(rs));
                bonjour_instance.destroy();
                bonjour_instance = null;
            }

            if (argv.enableHap) {
                server.unpublish();
            }
            for (const http_server of listening_servers) {
                http_server.close();
            }

            await Promise.all([
                fs.unlink(path.join(data_path, 'hap-server.pid')),
                wrote_port_file ? fs.unlink(path.join(data_path, 'hap-server-port')) : null,
                fs.unlink(path.join(data_path, 'cli-token')),

                server.automations.stop(),

                new Promise((rs, rj) => server.wss.close(err => err ? rj(err) : rs())),
            ]);

            server.removeListener(AddAccessoryEvent, saveCachedAccessories);
            server.removeListener(UpdateAccessoryConfigurationEvent, saveCachedAccessories);
            server.removeListener(RemoveAccessoryEvent, saveCachedAccessories);

            setTimeout(() => process.exit(128 + (code as number)), 1000);
        });
    }

    process.on('SIGHUP', reloadConfig.bind(null, server, {config, config_path, data_path}, argv));
}

async function reloadConfig(server: Server, old_options: {
    config: ConfigurationFile;
    config_path: string;
    data_path: string;
}, argv: Arguments) {
    const log = new Logger('Reload');
    log('Reloading configuration');

    const {config, config_path, data_path} = await getConfig(argv);

    // Reject new configuration if config/data paths change
    if (config_path !== old_options.config_path) throw new Error('Cannot change configuration path while running');
    if (data_path !== old_options.data_path) throw new Error('Cannot change data path while running');
    if (!isEqual(config['plugin-path'], old_options.config['plugin-path'])) throw new Error('Cannot change plugin paths while running');

    const _nullchildren: (keyof ConfigurationFile)[] = [
        // List configuration keys that can be changed
        'hostname',
        'bridges',
        'accessories2',
        'platforms2',
    ];
    const nullchildren = _nullchildren.reduce((acc, cur) => (acc[cur] = null, acc), {} as Record<string, null>);

    if (!isEqual(
        Object.assign({}, nullchildren, old_options.config, nullchildren),
        Object.assign({}, nullchildren, config, nullchildren)
    )) {
        log.warn('Some options that don\'t support reloading have changed. The new values will not take effect ' +
            'until hap-server is restarted.');
    }

    if (old_options.config.hostname !== config.hostname) {
        if (argv.advertiseWebInterface) {
            log.warn('Cannot change hostname when using an automatically generated and advertised hostname');
        } else if (!config.hostname) {
            log.warn('Cannot remove hostname');
        } else {
            log.info('Changing hostname from %s to %s', old_options.config.hostname, config.hostname);

            server.setHostname(config.hostname);
            old_options.config.hostname = config.hostname;
        }
    }

    //
    // Calculate bridge configuration changes
    //

    const added_bridges: Record<string, BridgeConfiguration> = {};
    const updated_bridges: Record<string, [BridgeConfiguration, BridgeConfiguration]> = {};
    const remaining_bridges: Record<string, BridgeConfiguration> = {};
    const removed_bridges: Record<string, BridgeConfiguration> = {};

    for (const bridge_config of config.bridges || []) {
        const uuid = bridge_config.uuid || hap.uuid.generate('hap-server:bridge:' + bridge_config.username);

        const old_bridge_config = (old_options.config.bridges || []).find(bridge_config => {
            return uuid === bridge_config.uuid || hap.uuid.generate('hap-server:bridge:' + bridge_config.username);
        });

        if (!old_bridge_config) {
            // Bridge was added
            added_bridges[uuid] = bridge_config;
        } else if (!isEqual(bridge_config, old_bridge_config)) {
            // Bridge configuration was updated
            updated_bridges[uuid] = [old_bridge_config, bridge_config];
        } else {
            // Bridge configuration wasn't changed
            remaining_bridges[uuid] = bridge_config;
        }
    }

    for (const old_bridge_config of old_options.config.bridges || []) {
        const uuid = old_bridge_config.uuid || hap.uuid.generate('hap-server:bridge:' + old_bridge_config.username);

        const bridge_config = added_bridges[uuid] || updated_bridges[uuid] || remaining_bridges[uuid];

        if (!bridge_config) {
            // Bridge was removed
            removed_bridges[uuid] = old_bridge_config;
        }
    }

    //
    // Calculate accessory configuration changes
    //

    const added_accessories: Record<string, AccessoryConfiguration> = {};
    const updated_accessories: Record<string, [AccessoryConfiguration, AccessoryConfiguration]> = {};
    const remaining_accessories: Record<string, AccessoryConfiguration> = {};
    const removed_accessories: Record<string, AccessoryConfiguration> = {};

    for (const accessory_config of config.accessories2 || []) {
        const uuid = accessory_config.uuid || hap.uuid.generate('accessory:' + accessory_config.plugin + ':' +
            accessory_config.accessory + ':' + accessory_config.name);

        const old_accessory_config = (old_options.config.accessories2 || []).find(accessory_config => {
            return uuid === (accessory_config.uuid || hap.uuid.generate('accessory:' + accessory_config.plugin + ':' +
                accessory_config.accessory + ':' + accessory_config.name));
        });

        if (!old_accessory_config || !server.accessories.getPluginAccessory(uuid)) {
            // Accessory was added (or it wasn't loaded at startup/last reload)
            added_accessories[uuid] = accessory_config;
            if (old_accessory_config) {
                old_options.config.accessories2?.splice(
                    old_options.config.accessories2.indexOf(old_accessory_config), 1);
            }
        } else if (!isEqual(accessory_config, old_accessory_config)) {
            // Accessory configuration was updated
            updated_accessories[uuid] = [old_accessory_config, accessory_config];
        } else {
            // Accessory configuration wasn't changed
            remaining_accessories[uuid] = accessory_config;
        }
    }

    for (const old_accessory_config of old_options.config.accessories2 || []) {
        const uuid = old_accessory_config.uuid || hap.uuid.generate('accessory:' + old_accessory_config.plugin + ':' +
            old_accessory_config.accessory + ':' + old_accessory_config.name);

        const accessory_config = added_accessories[uuid] || updated_accessories[uuid] || remaining_accessories[uuid];

        if (!accessory_config) {
            // Accessory was removed
            removed_accessories[uuid] = old_accessory_config;
        }
    }

    //
    // Calculate accessory platform configuration changes
    //

    const added_accessory_platforms: Record<string, AccessoryPlatformConfiguration> = {};
    const updated_accessory_platforms: // eslint-disable-next-line @typescript-eslint/indent
        Record<string, [AccessoryPlatformConfiguration, AccessoryPlatformConfiguration]> = {};
    const remaining_accessory_platforms: Record<string, AccessoryPlatformConfiguration> = {};
    const removed_accessory_platforms: Record<string, AccessoryPlatformConfiguration> = {};

    for (const platform_config of config.platforms2 || []) {
        const base_uuid = platform_config.uuid || 'accessoryplatform:' + platform_config.plugin + ':' +
            platform_config.platform + ':' + platform_config.name;
        const uuid = hap.uuid.isValid(base_uuid) ? base_uuid : hap.uuid.generate(base_uuid);

        const old_platform_config = (old_options.config.platforms2 || []).find(platform_config => {
            const base_uuid = platform_config.uuid || 'accessoryplatform:' + platform_config.plugin + ':' +
                platform_config.platform + ':' + platform_config.name;
            return uuid === (hap.uuid.isValid(base_uuid) ? base_uuid : hap.uuid.generate(base_uuid));
        });

        if (!old_platform_config) {
            // Accessory platform was added
            added_accessory_platforms[uuid] = platform_config;
        } else if (!isEqual(platform_config, old_platform_config)) {
            // Accessory platform configuration was updated
            updated_accessory_platforms[uuid] = [old_platform_config, platform_config];
        } else {
            // Accessory platform configuration wasn't changed
            remaining_accessory_platforms[uuid] = platform_config;
        }
    }

    for (const old_platform_config of old_options.config.platforms2 || []) {
        const base_uuid = old_platform_config.uuid || 'accessoryplatform:' + old_platform_config.plugin + ':' +
            old_platform_config.platform + ':' + old_platform_config.name;
        const uuid = hap.uuid.isValid(base_uuid) ? base_uuid : hap.uuid.generate(base_uuid);

        const platform_config = added_accessory_platforms[uuid] || updated_accessory_platforms[uuid] ||
            remaining_accessory_platforms[uuid];

        if (!platform_config) {
            // Accessory platform was removed
            removed_accessory_platforms[uuid] = old_platform_config;
        }
    }

    //
    // Load updated bridge configuration
    //

    await server.loadBridgesFromConfig(Object.values(added_bridges));
    for (const [uuid, bridge_config] of Object.entries(added_bridges)) {
        old_options.config.bridges?.push(bridge_config);
    }
    for (const [uuid, [old_bridge_config, bridge_config]] of Object.entries(updated_bridges)) {
        log.warn('Reloading bridge configuration not implemented');

        // old_options.config.bridges?.splice(old_options.config.bridges.indexOf(old_bridge_config), 1);
        // old_options.config.bridges?.push(bridge_config);
    }
    await Promise.all(Object.keys(removed_bridges).map(uuid => server.accessories.unloadBridge(uuid).then(() => {
        old_options.config.bridges?.splice(old_options.config.bridges.indexOf(removed_bridges[uuid]), 1);
    })));

    //
    // Load updated accessory configuration
    //

    await server.loadAccessoriesFromConfig(Object.values(added_accessories));
    for (const [uuid, accessory_config] of Object.entries(added_accessories)) {
        old_options.config.accessories?.push(accessory_config);
    }
    for (const [uuid, [old_accessory_config, accessory_config]] of Object.entries(updated_accessories)) {
        const accessory = server.accessories.getPluginAccessory(uuid);
        log.info(accessory, uuid, old_accessory_config, accessory_config);
        if (!accessory || !(accessory instanceof PluginStandaloneAccessory)) {
            throw new Error('Unknown accessory');
        }

        accessory.reload(accessory_config);

        old_options.config.accessories2?.splice(old_options.config.accessories2.indexOf(old_accessory_config), 1);
        old_options.config.accessories2?.push(accessory_config);
    }
    await Promise.all(Object.entries(removed_accessories).map(([uuid, old_accessory_config]) => {
        server.accessories.removeAccessory(server.accessories.accessories.find(a => a.uuid === uuid)!);
        old_options.config.accessories2?.splice(old_options.config.accessories2.indexOf(old_accessory_config), 1);
    }));

    //
    // Load updated accessory platform configuration
    //

    await server.loadAccessoryPlatformsFromConfig(Object.values(added_accessory_platforms));
    for (const [uuid, platform_config] of Object.entries(added_accessory_platforms)) {
        old_options.config.platforms?.push(platform_config);
    }
    for (const [uuid, [old_platform_config, platform_config]] of Object.entries(updated_accessory_platforms)) {
        const accessory_platform = server.accessories.accessory_platforms.find(p => p.uuid === uuid);
        if (!accessory_platform) throw new Error('Unknown accessory platform');

        await accessory_platform.reload(platform_config);

        old_options.config.platforms2?.splice(old_options.config.platforms2.indexOf(old_platform_config), 1,
            platform_config);
    }
    await Promise.all(Object.entries(removed_accessory_platforms).map(([uuid, old_platform_config]) => {
        server.accessories.removeAccessoryPlatform(uuid);
        old_options.config.platforms2?.splice(old_options.config.platforms2.indexOf(old_platform_config), 1);
    }));

    log.info('Finished reloading configuration');
}

async function enableAdvertising(
    argv: Arguments, server: Server, data_path: string, listen_addresses: ListenAddresses,
    https_addresses: HttpsAddresses
): Promise<[import('bonjour').Bonjour, string]> {
    const bonjour = await import('bonjour');
    const {v4: genuuid} = await import('uuid');
    const _mkdirp = await import('mkdirp');
    const forge = await import('node-forge');

    const mkdirp = util.promisify(_mkdirp);

    const bonjour_server_port = argv.advertiseWebInterfacePort;

    const bonjour_instance = bonjour({
        interface: '0.0.0.0',
    });

    let uuid = await server.storage.getItem('TLSCertificateUUID');
    if (!uuid) {
        uuid = genuuid();
        log.info('Generated new server UUID for automatic TLS provisioning', uuid);
        await server.storage.setItem('TLSCertificateUUID', uuid);
    }
    const bonjour_server_uuid = uuid;

    const bonjour_hostname = `hap-server-${bonjour_server_uuid.toLowerCase()}.local`;
    server.hostname = bonjour_hostname;
    log.info('Bonjour hostname: %s', bonjour_hostname);

    await mkdirp(path.join(data_path, 'certificates'));
    const bonjour_secure_server_certificate_path =
        path.join(data_path, 'certificates', bonjour_server_uuid + '.pem');
    const bonjour_secure_server_certificate_key_path =
        path.join(data_path, 'certificates', bonjour_server_uuid + '.key');

    let private_key;
    try {
        const key_file = await fs.readFile(bonjour_secure_server_certificate_key_path, 'utf-8') as string;
        private_key = forge.pki.privateKeyFromPem(key_file);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;

        log.info('Generating new private key for server %s', bonjour_server_uuid);

        const keypair = forge.pki.rsa.generateKeyPair(2048);
        const pem = forge.pki.privateKeyToPem(keypair.privateKey);
        await fs.writeFile(bonjour_secure_server_certificate_key_path, pem, 'utf-8');
        private_key = keypair.privateKey;
    }

    // @ts-ignore
    const public_key = forge.pki.setRsaPublicKey(private_key.n, private_key.e);

    let certificate;
    let certificate_pem: string;
    try {
        const certificate_file = certificate_pem =
            await fs.readFile(bonjour_secure_server_certificate_path, 'utf-8') as string;
        certificate = forge.pki.certificateFromPem(certificate_file);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;

        log.info('Creating new certificate for server %s', bonjour_server_uuid);

        certificate = forge.pki.createCertificate();
        certificate.publicKey = public_key;
        certificate.serialNumber = '01';
        certificate.validity.notBefore = new Date();
        certificate.validity.notAfter = new Date();
        certificate.validity.notAfter.setFullYear(certificate.validity.notBefore.getFullYear() + 1);
        const attrs = [
            {name: 'commonName', value: `hap-server ${bonjour_server_uuid.toLowerCase()}`},
            {name: 'countryName', value: 'GB'},
            {name: 'organizationName', value: 'hap-server'},
            {shortName: 'OU', value: 'hap-server'},
        ];
        certificate.setSubject(attrs);
        certificate.setIssuer(attrs);
        certificate.setExtensions([
            {name: 'basicConstraints', cA: false},
            {
                name: 'keyUsage',
                keyCertSign: false,
                digitalSignature: true,
                nonRepudiation: true,
                keyEncipherment: true,
                dataEncipherment: true,
            },
            {
                name: 'extKeyUsage',
                serverAuth: true,
                clientAuth: false,
                codeSigning: false,
                emailProtection: false,
                timeStamping: false,
            },
            {
                name: 'subjectAltName',
                altNames: [
                    {type: 2, value: bonjour_hostname}, // type: 2 is dNSName
                ],
            },
            {name: 'subjectKeyIdentifier'},
        ]);
        certificate.sign(private_key);

        const pem = certificate_pem = forge.pki.certificateToPem(certificate);
        await fs.writeFile(bonjour_secure_server_certificate_path, pem, 'utf-8');
    }

    const sha256 = forge.md.sha256.create();
    // @ts-ignore
    sha256.start();
    sha256.update(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes());
    const bonjour_secure_server_certificate_fingerprints =
        (sha256.digest().toHex() as string).replace(/(.{2})(?!$)/g, m => `${m}:`);

    const htmlencode = (format: TemplateStringsArray, ...args: any[]) => {
        return format.map((f, i) => i === 0 ? f : args[i - 1]
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') +
        f).join('');
    };

    const bonjour_http_service = bonjour_instance!.publish({
        name: 'hap-server',
        host: bonjour_hostname,
        port: bonjour_server_port,
        type: 'http',
        protocol: 'tcp',
        txt: {
            path: '/',
        },
    });
    const bonjour_https_service = bonjour_instance!.publish({
        name: 'hap-server',
        host: bonjour_hostname,
        port: bonjour_server_port,
        type: 'https',
        protocol: 'tcp',
        txt: {
            path: '/',
        },
    });

    listen_addresses.push(['net', '::', bonjour_server_port, {
        middleware: (req, res, next) => {
            // @ts-ignore
            if (req.connection.encrypted) {
                res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            }

            if (req.url === '/certificate') {
                res.setHeader('Content-Type', 'application/x-pem-file');
                res.setHeader('Content-Disposition',
                    `attachment; filename="hap-server-${bonjour_server_uuid}-certificate.pem"`);
                res.writeHead(200);
                res.end(certificate_pem);
            // @ts-ignore
            } else if (!req.connection.encrypted) {
                const url = `https://${bonjour_hostname}:${bonjour_server_port}${req.url}`;
                res.setHeader('Location', url);
                res.writeHead(301);
                res.end('<!DOCTYPE html><html><head><title>Redirecting</title></head><body>' +
                    htmlencode`<h1>Redirecting</h1><p>Redirecting to <a href="${url}">${url}</a>.</p>` +
                    '</body></html>\n');
            } else next();
        },
    }]);
    https_addresses[`[::]:${bonjour_server_port}`] = [
        bonjour_secure_server_certificate_path,
        bonjour_secure_server_certificate_key_path,
        {allow_unencrypted: true},
    ];

    const web_interface_address = `https://${bonjour_hostname}:${bonjour_server_port}/`;

    log.debug('Publishing Bonjour services', bonjour_http_service, bonjour_https_service);
    log.info('You can access the web interface on your local network at %s,', web_interface_address);
    log.info('    (remember to install the TLS certificate at %s,', bonjour_secure_server_certificate_path);
    log.info('        fingerprint: %s)', bonjour_secure_server_certificate_fingerprints);

    return [bonjour_instance, web_interface_address];
}
