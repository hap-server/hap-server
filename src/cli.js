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

import {Server, PluginManager} from '.';
import Logger, {forceColour as forceColourLogs} from './core/logger';

const log = new Logger();

yargs.option('debug', {
    alias: 'D',
    describe: 'Enable debug level logging',
    default: false,
});
yargs.option('timestamps', {
    aliases: ['T', 'timestamp'],
    describe: 'Add timestamps to logs',
    default: true,
});
yargs.option('force-colour', {
    aliases: ['C', 'force-color', 'color'],
    describe: 'Force colour in logs',
    default: false,
});

yargs.command('$0 [config]', 'Run the HAP and web server', yargs => {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });
    yargs.option('data-path', {
        aliases: ['U', 'user-storage-path'],
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
        aliases: ['Q', 'qrcode'],
        describe: 'Print setup information',
        default: false,
    });
    yargs.option('allow-unauthenticated', {
        aliases: ['I', 'insecure'],
        describe: 'Allow unauthenticated requests (for easier hacking)',
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

    const data_path = argv['data-path'] ? path.resolve(process.cwd(), argv['data-path'])
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
    if (argv['force-colour']) HomebridgeLogger.forceColor(), forceColourLogs();

    for (const plugin_path of argv['plugin-path'] || []) {
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

    log.info('Loading accessories and accessory platforms');
    await Promise.all([
        server.loadAccessoriesFromConfig(),
        server.loadAccessoryPlatformsFromConfig(),
    ]);

    log.info('Loading HAP bridges');
    await server.loadBridgesFromConfig();

    if (config.bridge || config.accessories || config.platforms) {
        log.info('Loading Homebridge');
        await server.loadHomebridge();
    }

    for (const bridge of server.bridges) {
        bridge.unauthenticated_access = argv['allow-unauthenticated'];
    }

    log.info('Publishing HAP services');
    await server.publish();

    if (argv.group) process.setgid(argv.group);
    if (argv.user) process.setuid(argv.user);

    if (argv['print-setup']) {
        for (const bridge of server.bridges) {
            // Bridge has already been paired with
            if (bridge.bridge._accessoryInfo && bridge.bridge._accessoryInfo.pairedClients.length) continue;

            bridge.printSetupInfo();
        }
    }

    for (const [signal, code] of Object.entries({'SIGINT': 2, 'SIGTERM': 15})) {
        process.on(signal, () => {
            log.info(`Got ${signal}, shutting down...`);

            server.unpublish();
            http_server.close();

            setTimeout(() => process.exit(128 + code), 2000);
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
