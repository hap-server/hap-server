import path from 'path';
import process from 'process';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

import yargs from 'yargs';
import chalk from 'chalk';

import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import HomebridgeLogger from 'homebridge/lib/logger';
import hap from 'hap-nodejs';

import {Server, PluginManager, Logger, forceColourLogs} from '.';

const log = new Logger();

const DEVELOPMENT = true;

yargs.option('debug', {
    alias: 'D',
    describe: 'Enable debug level logging',
    type: 'boolean',
    default: false,
});
yargs.option('timestamps', {
    alias: 'T',
    aliases: ['timestamp', 'T'],
    describe: 'Add timestamps to logs',
    type: 'boolean',
    default: true,
});
yargs.option('force-colour', {
    alias: 'C',
    aliases: ['force-color', 'color', 'C'],
    describe: 'Force colour in logs',
    type: 'boolean',
    default: false,
});

function getConfig(argv) {
    /**
     * Read configuration data.
     */

    const config_path = path.resolve(process.cwd(), argv.config);
    let config;

    try {
        const config_json = fs.readFileSync(config_path);
        config = JSON.parse(config_json);
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            console.error(chalk.red(`The configuration file (${config_path}) doesn\'t exist.`));
        } else if (error instanceof SyntaxError) {
            console.error(chalk.red(`Syntax error reading configuration file (${config_path}):`), error.message);
        } else {
            console.error(chalk.red(`Error reading configuration file (${config_path}):`), error);
        }

        throw process.exit(1);
    }

    for (const [plugin_name, plugin_config] of Object.entries(config.plugins || {})) {
        if (plugin_name === '*') PluginManager.default_plugin_config = plugin_config;
        else PluginManager.setPluginConfig(plugin_name, plugin_config);
    }

    /**
     * Storage paths.
     */

    const data_path = argv.dataPath ? path.resolve(process.cwd(), argv.dataPath)
        : config['data-path'] ? path.resolve(path.dirname(config_path), config['data-path'])
            : path.dirname(config_path);

    return [config, config_path, data_path];
}

yargs.command('$0 [config]', 'Run the HAP and web server', yargs => {
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
}, async argv => {
    if (DEVELOPMENT && argv.vueDevtoolsPort) {
        const {enableVueDevtools} = require('./core/connection');
        enableVueDevtools(argv.vueDevtoolsHost, argv.vueDevtoolsPort);
    }

    const [config, config_path, data_path] = await getConfig(argv);

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

    const cli_auth_token_bytes = await new Promise((rs, rj) => crypto.randomBytes(48, (err, bytes) => err ? rj(err) : rs(bytes)));
    const cli_auth_token = cli_auth_token_bytes.toString('hex');

    await new Promise((rs, rj) => fs.writeFile(path.join(data_path, 'cli-token'), cli_auth_token_bytes, err => err ? rj(err) : rs()));

    const server = await Server.createServer({
        data_path,
        config_path,
        config,
        cli_auth_token,
        webpack_hot: DEVELOPMENT && argv.webpackHot,
    });

    (async () => {
        log.info('Cleaning assets directory');
        const stat = await server.cleanAssets();
        log.info('Cleaned assets directory, removed', stat.deleted_assets.length, 'unused assets', stat);
    })().catch(err => log.error('Error cleaning assets directory', err));

    log.info('Starting web server');
    const http_server = server.createServer();
    await new Promise((rs, rj) => http_server.listen(config.http_port || 0, config.http_host || '::',
        err => err ? rj(err) : rs()));

    const http_host = config.http_host || '::';
    const http_port = http_server.address().port;
    log.info(`Listening on ${http_host} port ${http_port}`);

    await Promise.all([
        new Promise((rs, rj) => fs.writeFile(path.join(data_path, 'hap-server.pid'), process.pid, err => err ? rj(err) : rs())),
        new Promise((rs, rj) => fs.writeFile(path.join(data_path, 'hap-server-port'), http_port, err => err ? rj(err) : rs())),
    ]);

    log.info('Loading cached accessories');
    await server.loadCachedAccessories();

    log.info('Loading HAP bridges');
    await server.loadBridgesFromConfig();

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

    log.info('Starting automations');
    await server.loadAutomationsFromConfig();
    await server.loadAutomationsFromStorage();
    await server.automations.start();

    if (argv.group) process.setgid(argv.group);
    if (argv.user) process.setuid(argv.user);

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

    for (const [signal, code] of Object.entries({'SIGINT': 2, 'SIGTERM': 15})) {
        process.on(signal, async () => {
            exit_attempts++;

            if (exit_attempts >= 3) {
                log.info(`Got ${signal} (x${exit_attempts}), exiting...`);
                throw process.exit(128 + code);
            } else if (exit_attempts > 1) {
                log.info(`Got ${signal} (x${exit_attempts} - ${3 - exit_attempts} left to force exit), shutting down...`);
            } else log.info(`Got ${signal}, shutting down...`);

            await Promise.all([
                new Promise((rs, rj) => fs.unlink(path.join(data_path, 'hap-server.pid'), err => err ? rj(err) : rs())),
                new Promise((rs, rj) => fs.unlink(path.join(data_path, 'hap-server-port'), err => err ? rj(err) : rs())),
                new Promise((rs, rj) => fs.unlink(path.join(data_path, 'cli-token'), err => err ? rj(err) : rs())),
            ]);

            await server.automations.stop();

            server.unpublish();
            http_server.close();

            setTimeout(() => process.exit(128 + code), 1000);
        });
    }
});

async function connect(argv) {
    const [config, config_path, data_path] = await getConfig(argv);

    Logger.enable_debug = argv.debug;
    Logger.enable_timestamps = argv.timestamps;
    if (argv.forceColour) forceColourLogs();

    log.debug('Arguments', argv);

    const cli_auth_token_bytes = await new Promise((rs, rj) => fs.readFile(path.join(data_path, 'cli-token'), (err, bytes) => err ? rj(err) : rs(bytes)));
    const cli_auth_token = cli_auth_token_bytes.toString('hex');

    const server_pid = parseInt(await new Promise((rs, rj) => fs.readFile(path.join(data_path, 'hap-server.pid'), 'utf-8', (err, bytes) => err ? rj(err) : rs(bytes))));
    const http_port = parseInt(await new Promise((rs, rj) => fs.readFile(path.join(data_path, 'hap-server-port'), 'utf-8', (err, bytes) => err ? rj(err) : rs(bytes))));

    const http_host = config.http_host && !['::', '0.0.0.0'].includes(config.http_host) ?
        config.http_host.match(/[^0-9.]/) ? `[${config.http_host}]` : config.http_host : '127.0.0.1';

    const Connection = require('./common/connection').default;
    const WebSocket = require('ws');

    log.debug('Connecting to', `ws://${http_host}:${http_port}/websocket`);
    const connection = await Connection.connect(`ws://${http_host}:${http_port}/websocket`, WebSocket);

    const authenticated_user = await connection.authenticateWithCliToken(cli_auth_token);
    log.debug('Authenticated user', authenticated_user);

    return [connection, authenticated_user, config, config_path, data_path, server_pid];
}

yargs.command('get-characteristics <config> <characteristics>', 'Get characteristics', yargs => {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });
    yargs.positional('characteristics', {
        describe: 'Dot separated accessory, service and characteristic UUIDs to get',
        type: 'array',
    });
}, async argv => {
    // eslint-disable-next-line no-unused-vars
    const [connection, authenticated_user, config, config_path, data_path, server_pid] = await connect(argv);

    const characteristic_uuids = [argv.characteristics].concat(argv._.slice(1));

    const characteristics = await connection.getCharacteristics(...characteristic_uuids.map((uuid, index) => {
        const accessory_uuid = uuid.substr(0, uuid.indexOf('.'));
        const service_uuid = uuid.substr(uuid.indexOf('.') + 1, uuid.lastIndexOf('.') - uuid.indexOf('.') - 1);
        const characteristic_uuid = uuid.substr(uuid.lastIndexOf('.') + 1);

        log.withPrefix(`Characteristic #${index + 1}`).debug('UUID', [accessory_uuid, service_uuid, characteristic_uuid]);
        return [accessory_uuid, service_uuid, characteristic_uuid];
    }));

    // eslint-disable-next-line guard-for-in
    for (const index in characteristics) {
        const characteristic = characteristics[index];

        log.withPrefix(`Characteristic #${parseInt(index) + 1}`).debug(characteristic);
        log.withPrefix(`Characteristic #${parseInt(index) + 1}`).info((characteristic.description || 'Value') + ':', characteristic.value);
    }

    connection.ws.close();
});

yargs.command('set-characteristic <config> <characteristic> <value>', 'Set a characteristic', yargs => {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });
    yargs.positional('characteristic', {
        describe: 'Dot separated accessory, service and characteristic UUID',
        type: 'string',
    });
    yargs.positional('value', {
        describe: 'The new value',
        type: 'string',
    });
}, async argv => {
    // eslint-disable-next-line no-unused-vars
    const [connection, authenticated_user, config, config_path, data_path, server_pid] = await connect(argv);

    const uuid = argv.characteristic;
    const accessory_uuid = uuid.substr(0, uuid.indexOf('.'));
    const service_uuid = uuid.substr(uuid.indexOf('.') + 1, uuid.lastIndexOf('.') - uuid.indexOf('.') - 1);
    const characteristic_uuid = uuid.substr(uuid.lastIndexOf('.') + 1);

    log.withPrefix('Characteristic').debug('UUID', [accessory_uuid, service_uuid, characteristic_uuid]);

    const characteristic = (await connection.getCharacteristics([accessory_uuid, service_uuid, characteristic_uuid]))[0];

    log.withPrefix('Characteristic').debug(characteristic);
    log.withPrefix('Characteristic').info((characteristic.description || 'Value') + ':', characteristic.value);

    const formatted_value = characteristic.format === 'bool' ? argv.value.match(/(t|y)/i) ? true : false
        : argv.value;

    log.withPrefix('Characteristic').info('Setting value to', {value: argv.value, formatted_value});

    const response = await connection.setCharacteristic(accessory_uuid, service_uuid, characteristic_uuid, formatted_value);

    log.withPrefix('Characteristic').debug('Response', response);

    connection.ws.close();
});

yargs.command('version', 'Show version number', yargs => {}, async argv => {
    console.log('hap-server version', require('.').version, DEVELOPMENT ? chalk.red('development') : chalk.grey('production'));
    console.log('homebridge version', require('homebridge/package').version);
    console.log('hap-nodejs version', require('hap-nodejs/package').version);
});

yargs.scriptName('hap-server').help().version(false).showHelpOnFail(false, 'Specify --help for available options');

export default yargs;
