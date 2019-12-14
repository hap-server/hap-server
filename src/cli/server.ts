/// <reference path="../types/homebridge.d.ts" />

import path from 'path';
import process from 'process';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import util from 'util';
import net from 'net';
import http from 'http';

import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import HomebridgeLogger from 'homebridge/lib/logger';
import * as hap from '../hap-nodejs';

import {Server, PluginManager, Logger, forceColourLogs, events} from '..';
import {
    ServerStartupFinishedEvent, ServerStoppingEvent, ServerPluginRegisteredEvent,
    AddAccessoryEvent, RemoveAccessoryEvent, UpdateAccessoryConfigurationEvent,
} from '../events/server';
import {getConfig, log, GlobalArguments} from '.';

const randomBytes = util.promisify(crypto.randomBytes);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

const DEVELOPMENT = true;

export const command = '$0 [config]';
export const describe = 'Run the HAP and web server';

export function builder(yargs: typeof import('yargs')) {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
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

    yargs.option('experimental-history', {
        describe: 'Experimental history support',
        type: 'boolean',
        default: false,
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

        return readFile(path.resolve(base_path, certificate), 'utf-8');
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

    experimentalHistory: boolean;

    user?: string;
    group?: string;

    // Development
    vueDevtoolsHost: string;
    vueDevtoolsPort?: string;
    webpackHot: boolean;
}

export async function handler(argv: Arguments) {
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
        hostname: config.hostname,
        data_path,
        config_path,
        config,
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

    interface AddressOptions {
        middleware?: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
    }
    interface HttpsOptions {
        allow_unencrypted?: boolean;
    }

    const listen_addresses: (['net', string, number] | ['unix', string] |
        ['net', string, number, AddressOptions | undefined] | ['unix', string, AddressOptions | undefined])[] = // eslint-disable-line @typescript-eslint/indent
        ([] as (string | number | ['net', string, number] | ['unix', string])[])
            .concat(config.listen || []).map(a => a instanceof Array ? a as Address : parseAddress(a, data_path));
    const https_addresses: Record<string, string | [string, string] | [string, string, HttpsOptions]> = {};
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

    let bonjour_instance: any = null;
    let web_interface_address = null;

    if (argv.advertiseWebInterface) {
        const bonjour = require('bonjour');
        const genuuid = require('uuid/v4');
        const mkdirp = require('mkdirp');
        const forge = require('node-forge');

        const bonjour_server_port = argv.advertiseWebInterfacePort;

        bonjour_instance = bonjour({
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
        const bonjour_secure_server_certificate_path = path.join(data_path, 'certificates', bonjour_server_uuid + '.pem');
        const bonjour_secure_server_certificate_key_path = path.join(data_path, 'certificates', bonjour_server_uuid + '.key');

        let private_key;
        try {
            const key_file = await readFile(bonjour_secure_server_certificate_key_path, 'utf-8');
            private_key = forge.pki.privateKeyFromPem(key_file);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;

            log.info('Generating new private key for server %s', bonjour_server_uuid);

            const keypair = forge.pki.rsa.generateKeyPair(2048);
            const pem = forge.pki.privateKeyToPem(keypair.privateKey);
            await writeFile(bonjour_secure_server_certificate_key_path, pem, 'utf-8');
            private_key = keypair.privateKey;
        }

        const public_key = forge.pki.setRsaPublicKey(private_key.n, private_key.e);

        let certificate;
        let certificate_pem: string;
        try {
            const certificate_file = certificate_pem = await readFile(bonjour_secure_server_certificate_path, 'utf-8');
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
            await writeFile(bonjour_secure_server_certificate_path, pem, 'utf-8');
        }

        const sha256 = forge.md.sha256.create();
        sha256.start();
        sha256.update(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes());
        const bonjour_secure_server_certificate_fingerprints =
            (sha256.digest().toHex() as string).replace(/(.{2})(?!$)/g, m => `${m}:`);

        const htmlencode = (format: TemplateStringsArray, ...args: any[]) => {
            return format.map((f, i) => i === 0 ? f : args[i - 1]
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            + f).join('');
        };

        const bonjour_http_service = bonjour_instance.publish({
            name: 'hap-server',
            host: bonjour_hostname,
            port: bonjour_server_port,
            type: 'http',
            protocol: 'tcp',
            txt: {
                path: '/',
            },
        });
        const bonjour_https_service = bonjour_instance.publish({
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
                if (req.connection.encrypted) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

                if (req.url === '/certificate') {
                    res.setHeader('Content-Type', 'application/x-pem-file');
                    res.setHeader('Content-Disposition', `attachment; filename="hap-server-${bonjour_server_uuid}-certificate.pem"`);
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

        web_interface_address = `https://${bonjour_hostname}:${bonjour_server_port}/`;

        log.debug('Publishing Bonjour services', bonjour_http_service, bonjour_https_service);
        log.info('You can access the web interface on your local network at %s,', web_interface_address);
        log.info('    (remember to install the TLS certificate at %s,', bonjour_secure_server_certificate_path);
        log.info('        fingerprint: %s)', bonjour_secure_server_certificate_fingerprints);
    }

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
                null,
            cert: (await getCertificates(https as string | [string, string], data_path))
                .filter(c => (c as string).match(/CERTIFICATE/i)),
            key: (await getCertificates(https as string | [string, string], data_path))
                .filter(c => (c as string).match(/PRIVATE KEY/i)),
            crl: await getCertificates(https_crl, data_path),
            passphrase: https_passphrase,

            requestCert: !!https_request_client_certificate || !!https_require_client_certificate,
            rejectUnauthorized: !!https_require_client_certificate,
        }, options && options.middleware) : server.createServer(null, options && options.middleware);
        const listening_server: net.Server = https && https_options && https_options.allow_unencrypted ? net.createServer(connection => {
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
            const http_port = listening_server.address().port;
            log.info(`Listening on ${address[1]} port ${http_port}`);

            if (address[1] === '::' && !wrote_port_file) {
                await writeFile(path.join(data_path, 'hap-server-port'), http_port);
                wrote_port_file = true;
            }
        } else if (address[0] === 'unix') {
            try {
                await unlink(address[1]);
            } catch (err) {}
            await new Promise((rs, rj) => listening_server.listen(address[1], () => rs()));

            log.info(`Listening on UNIX socket ${address[1]}`);
        }

        listening_servers.push(listening_server);
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
        server.accessories.loadHomebridge();
    }

    for (const bridge of server.accessories.bridges) {
        bridge.unauthenticated_access = argv.allowUnauthenticated;
    }

    log.info('Publishing HAP services');
    await server.publish();

    log.info('Loading accessories and accessory platforms');
    await Promise.all([
        server.loadAccessoriesFromConfig(),
        server.loadAccessoryPlatformsFromConfig(),
    ]);

    if (server.accessories.homebridge) {
        if (server.accessories.homebridge.homebridge._asyncCalls !== 0) {
            log.info('Waiting for Homebridge to finish loading');
            await new Promise(rs => server.accessories.homebridge.bridge.once('listening', rs));
        }

        log.info('Loading accessories from Homebridge');
        await server.accessories.loadHomebridgeAccessories();
    }

    log.info('Saving cached accessories');
    await server.saveCachedAccessories();

    function saveCachedAccessories(event: AddAccessoryEvent | UpdateAccessoryConfigurationEvent | RemoveAccessoryEvent) {
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
        const password = new (require('xkcd-password'))();

        const setup_token = server.setup_token = await password.generate({
            numWords: 4,
            minLength: 5,
            maxLength: 8,
        });

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
                await new Promise(rs => bonjour_instance.unpublishAll(rs));
                bonjour_instance.destroy();
            }

            server.unpublish();
            for (const http_server of listening_servers) {
                http_server.close();
            }

            await Promise.all([
                unlink(path.join(data_path, 'hap-server.pid')),
                wrote_port_file ? unlink(path.join(data_path, 'hap-server-port')) : null,
                unlink(path.join(data_path, 'cli-token')),

                server.automations.stop(),

                new Promise((rs, rj) => server.wss.close((err: Error) => err ? rj(err) : rs())),
            ]);

            server.removeListener(AddAccessoryEvent, saveCachedAccessories);
            server.removeListener(UpdateAccessoryConfigurationEvent, saveCachedAccessories);
            server.removeListener(RemoveAccessoryEvent, saveCachedAccessories);

            setTimeout(() => process.exit(128 + (code as number)), 1000);
        });
    }
}
