import path from 'path';
import process from 'process';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import util from 'util';
import net from 'net';

import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import HomebridgeLogger from 'homebridge/lib/logger';
import hap from 'hap-nodejs';

import {Server, PluginManager, Logger, forceColourLogs, events} from '..';
import {
    ServerStartupFinishedEvent, ServerStoppingEvent, ServerPluginRegisteredEvent,
    AddAccessoryEvent, RemoveAccessoryEvent, UpdateAccessoryConfigurationEvent,
} from '../events/server';
import {getConfig, log} from '.';

const randomBytes = util.promisify(crypto.randomBytes);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

const DEVELOPMENT = true;

export const command = '$0 [config]';
export const describe = 'Run the HAP and web server';

export function builder(yargs) {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });

    yargs.option('data-path', {
        alias: 'U',
        aliases: ['user-storage-path', 'U'],
        describe: 'Path to store data',
        type: 'string',
    });
    yargs.option('plugin-path', {
        alias: 'P',
        describe: 'Additional paths to look for plugins at as well as the default location'
            + ' ([path] can also point to a single plugin)',
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
function parseAddress(address, base_path) {
    let match;

    if (typeof address === 'number' || address.match(/^\d+$/)) {
        return ['net', '::', parseInt(address)];
    } else if ((match = address.match(/^([0-9.]+):(\d+)$/)) && net.isIPv4(match[1])) {
        return ['net', match[1], match[2]];
    } else if ((match = address.match(/^\[([0-9a-f:.]+)\]:(\d+)$/i)) && net.isIPv6(match[1])) {
        return ['net', match[1], match[2]];
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
function addressToString(address) {
    if (address[0] === 'net' && net.isIPv4(address[1])) {
        return `${address[1]}:${address[2]}`;
    } else if (address[0] === 'net' && net.isIPv6(address[1])) {
        return `[${address[1]}]:${address[2]}`;
    } else if (address[0] === 'unix') {
        return `unix:${address[1]}`;
    }

    throw new Error('Invalid address array');
}

function normaliseAddress(address, base_path) {
    return addressToString(parseAddress(address, base_path));
}

/**
 * Returns an array of certificates.
 *
 * @param {(string|string[])} certificates
 * @param {string} [base_path]
 * @return {Promise<string[]>}
 */
function getCertificates(certificates, base_path) {
    return Promise.all([].concat(certificates || []).map(async certificate => {
        if (certificate.startsWith('-----')) return certificate;

        return readFile(path.resolve(base_path, certificate), 'utf-8');
    }));
}

export async function handler(argv) {
    if (DEVELOPMENT && argv.vueDevtoolsPort) {
        const {enableVueDevtools} = require('../server/connection');
        enableVueDevtools(argv.vueDevtoolsHost, argv.vueDevtoolsPort);
    }

    const {config, config_path, data_path} = await getConfig(argv);

    const hap_storage_path = path.join(data_path, 'persist');
    hap.init(hap_storage_path);

    HomebridgeUser.setStoragePath(data_path);
    HomebridgeUser.configPath = () => config_path;
    HomebridgeUser.config = () => config;

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
    log.debug('Homebridge plugin paths:', HomebridgePluginManager.paths);
    log.debug('Homebridge accessory cache path:', HomebridgeUser.cachedAccessoryPath());

    PluginManager.storage_path = path.resolve(data_path, 'plugin-storage');
    await PluginManager.loadPlugins();

    const cli_auth_token_bytes = await randomBytes(48);
    const cli_auth_token = cli_auth_token_bytes.toString('hex');

    await writeFile(path.join(data_path, 'cli-token'), cli_auth_token_bytes);
    await writeFile(path.join(data_path, 'hap-server.pid'), process.pid);

    const server = await Server.createServer({
        data_path,
        config_path,
        config,
        cli_auth_token,
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

    const listen_addresses = [].concat(config.listen || []).map(address => parseAddress(address, data_path));
    const https_addresses = {};
    for (const [address, certificate] of Object.entries(config['listen-https'] || {})) {
        https_addresses[normaliseAddress(address, data_path)] = certificate;
    }
    const https_request_client_certificate_addresses = {};
    for (const [address, certificate] of config['listen-https+request-client-certificate'] instanceof Array ?
        config['listen-https+request-client-certificate'].map(address => [address, true]) :
        Object.entries(config['listen-https+request-client-certificate'] || {})
    ) {
        https_request_client_certificate_addresses[normaliseAddress(address, data_path)] = certificate;
    }
    const https_require_client_certificate_addresses = {};
    for (const [address, certificate] of Object.entries(config['listen-https+require-client-certificate'] || {})) {
        https_require_client_certificate_addresses[normaliseAddress(address, data_path)] = certificate;
    }
    const https_address_crls = {};
    for (const [address, crl] of Object.entries(config['listen-https+crl'] || {})) {
        https_address_crls[normaliseAddress(address, data_path)] = crl;
    }
    const https_address_passphrases = {};
    for (const [address, passphrase] of Object.entries(config['listen-https+passphrase'] || {})) {
        https_address_passphrases[normaliseAddress(address, data_path)] = passphrase;
    }

    if (!config.listen && !listen_addresses.length) {
        log.warn('No listening addresses - using a random port');
        listen_addresses.push(['net', '::', 0]);
    }

    log.info('Listen addresses', listen_addresses, https_addresses, https_request_client_certificate_addresses,
        https_require_client_certificate_addresses);
    const listening_servers = [];
    let wrote_port_file = false;

    for (const address of listen_addresses) {
        const address_string = addressToString(address);
        const https = https_addresses[address_string];
        const https_request_client_certificate = https_request_client_certificate_addresses[address_string];
        const https_require_client_certificate = https_require_client_certificate_addresses[address_string];
        const https_crl = https_address_crls[address_string];
        const https_passphrase = https_address_passphrases[address_string];

        const http_server = https ? server.createSecureServer({
            ca: await getCertificates(https_require_client_certificate || https_request_client_certificate, data_path),
            cert: await getCertificates(https, data_path),
            key: await getCertificates(https, data_path),
            crl: await getCertificates(https_crl, data_path),
            passphrase: https_passphrase,

            requestCert: !!https_request_client_certificate || !!https_require_client_certificate,
            rejectUnauthorized: !!https_require_client_certificate,
        }) : server.createServer();

        if (address[0] === 'net') {
            await new Promise((rs, rj) => http_server.listen(address[2], address[1], err => err ? rj(err) : rs()));

            const http_port = http_server.address().port;
            log.info(`Listening on ${address[1]} port ${http_port}`);

            if (address[1] === '::' && !wrote_port_file) {
                await writeFile(path.join(data_path, 'hap-server-port'), http_port);
                wrote_port_file = true;
            }
        } else if (address[0] === 'unix') {
            try {
                await unlink(address[1]);
            } catch (err) {}
            await new Promise((rs, rj) => http_server.listen(address[1], err => err ? rj(err) : rs()));

            log.info(`Listening on UNIX socket ${address[1]}`);
        }

        listening_servers.push(http_server);
    }

    log.info('Loading cached accessories');
    await server.loadCachedAccessories();

    log.info('Loading HAP bridges');
    await server.loadBridgesFromConfig();
    await server.loadBridgesFromStorage();

    if (!argv.enableHomebridge) {
        log.info('Not loading Homebridge as it was disabled on the command line');
    } else if (config.bridge || config.accessories || config.platforms) {
        log.info('Loading Homebridge');
        server.loadHomebridge();
    }

    for (const bridge of server.bridges) {
        bridge.unauthenticated_access = argv.allowUnauthenticated;
    }

    log.info('Publishing HAP services');
    await server.publish();

    log.info('Loading accessories and accessory platforms');
    await Promise.all([
        server.loadAccessoriesFromConfig(),
        server.loadAccessoryPlatformsFromConfig(),
    ]);

    if (server.homebridge) {
        if (server.homebridge._asyncCalls !== 0) {
            log.info('Waiting for Homebridge to finish loading');
            await new Promise(rs => server.homebridge.bridge.once('listening', rs));
        }

        log.info('Loading accessories from Homebridge');
        await server.loadHomebridgeAccessories();
    }

    log.info('Saving cached accessories');
    await server.saveCachedAccessories();

    function saveCachedAccessories(event) {
        log.info('Saving cached accessories');
        server.saveCachedAccessories();
    }
    server.on(AddAccessoryEvent, saveCachedAccessories);
    server.on(UpdateAccessoryConfigurationEvent, saveCachedAccessories);
    server.on(RemoveAccessoryEvent, saveCachedAccessories);

    log.info('Starting automations');
    await server.loadAutomationsFromConfig();
    await server.loadAutomationsFromStorage();
    await server.loadScenesFromStorage();
    await server.automations.start();

    if (argv.user || argv.group) log.info('Setting uid/gid');
    if (argv.group) process.setgid(argv.group);
    if (argv.user) process.setuid(argv.user);

    server.emit(ServerStartupFinishedEvent, server);

    log.info('Running', server.accessories.length, 'accessories',
        server.cached_accessories.length, 'cached accessories');

    for (const bridge of server.bridges) {
        log.info('Bridge', bridge.name, bridge.bridge.bridgedAccessories.length, 'accessories',
            server.cached_accessories.length, 'cached accessories');

        // Save the identifier cache in case any new accessories/services/characteristics have been added or expired
        bridge.expireUnusedIDs();

        // Bridge has already been paired with
        if (bridge.bridge._accessoryInfo && bridge.bridge._accessoryInfo.pairedClients.length) continue;

        if (argv.printSetup) bridge.printSetupInfo();
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

            server.unpublish();
            for (const http_server of listening_servers) {
                http_server.close();
            }

            await Promise.all([
                unlink(path.join(data_path, 'hap-server.pid')),
                unlink(path.join(data_path, 'hap-server-port')),
                unlink(path.join(data_path, 'cli-token')),

                server.automations.stop(),

                new Promise((rs, rj) => server.wss.close(err => err ? rj(err) : rs())),
            ]);

            server.removeListener(AddAccessoryEvent, saveCachedAccessories);
            server.removeListener(UpdateAccessoryConfigurationEvent, saveCachedAccessories);
            server.removeListener(RemoveAccessoryEvent, saveCachedAccessories);

            setTimeout(() => process.exit(128 + (code as number)), 1000);
        });
    }
}
