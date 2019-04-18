import path from 'path';
import process from 'process';
import os from 'os';
import fs from 'fs';

import yargs from 'yargs';
import chalk from 'chalk';

import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import HomebridgeLogger from 'homebridge/lib/logger';
import hap from 'hap-nodejs';

import {Server, PluginManager, Logger, forceColourLogs} from '.';

const log = new Logger();

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

    yargs.option('user', {
        alias: 'u',
        describe: 'User to run as after starting',
    });
    yargs.option('group', {
        alias: 'g',
        describe: 'Group to run as after starting',
    });
}, async argv => {
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

        process.exit(1);
        return;
    }

    /**
     * Storage paths.
     */

    const data_path = argv.dataPath ? path.resolve(process.cwd(), argv.dataPath)
        : config['data-path'] ? path.resolve(path.dirname(config_path), config['data-path'])
            : path.dirname(config_path);

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

    const server = await Server.createServer({
        data_path,
        config_path,
        config,
    });

    PluginManager.storage_path = path.resolve(data_path, 'plugin-storage');
    await PluginManager.loadPlugins();

    log.info('Starting web server');
    const http_server = server.createServer();
    await new Promise((rs, rj) => http_server.listen(config.http_port || 0, config.http_host || '::',
        err => err ? rj(err) : rs()));

    const http_host = config.http_host || '::';
    const http_port = http_server.address().port;
    log.info(`Listening on ${http_host} port ${http_port}`);

    log.info('Loading cached accessories');
    await server.loadCachedAccessories();

    log.info('Loading HAP bridges');
    await server.loadBridgesFromConfig();

    if (config.bridge || config.accessories || config.platforms) {
        log.info('Loading Homebridge');
        await server.loadHomebridge();
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

    log.info('Saving cached accessories');
    await server.saveCachedAccessories();

    if (argv.group) process.setgid(argv.group);
    if (argv.user) process.setuid(argv.user);

    log.info('Running', server.accessories.length, 'accessories',
        server.cached_accessories.length, 'cached accessories');

    for (const bridge of server.bridges) {
        log.info('Bridge', bridge.name, bridge.bridge.bridgedAccessories.length, 'accessories',
            server.cached_accessories.length, 'cached accessories');

        // Bridge has already been paired with
        if (bridge.bridge._accessoryInfo && bridge.bridge._accessoryInfo.pairedClients.length) continue;

        if (argv.printSetup) bridge.printSetupInfo();
    }

    for (const [signal, code] of Object.entries({'SIGINT': 2, 'SIGTERM': 15})) {
        process.on(signal, () => {
            log.info(`Got ${signal}, shutting down...`);

            server.unpublish();
            http_server.close();

            setTimeout(() => process.exit(128 + code), 1000);
        });
    }
});

yargs.command('version', 'Show version number', yargs => {}, async argv => {
    console.log('hap-server version', require('../package').version);
    console.log('homebridge version', require('homebridge/package').version);
    console.log('hap-nodejs version', require('hap-nodejs/package').version);
});

yargs.scriptName('hap-server').help().version(false);

// eslint-disable-next-line no-unused-vars
const _argv = yargs.argv;
