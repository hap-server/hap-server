import path from 'path';
import process from 'process';
import os from 'os';
import fs from 'fs';

import persist from 'node-persist';
import yargs from 'yargs';

import {Server as HomebridgeServer} from 'homebridge/lib/server';
import {Plugin as HomebridgePluginManager} from 'homebridge/lib/plugin';
import {User as HomebridgeUser} from 'homebridge/lib/user';
import HomebridgeLogger, {_system as homebridge_logger} from 'homebridge/lib/logger';
import hap from 'hap-nodejs';

import {Server} from '.';
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

yargs.command('$0', 'Run the HAP and web server [config]', yargs => {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });

    yargs.option('print-setup', {
        aliases: ['Q', 'qrcode'],
        describe: 'Print setup information',
        default: true,
    });
    yargs.option('allow-unauthenticated', {
        aliases: ['I', 'insecure'],
        describe: 'Allow unauthenticated requests (for easier hacking)',
        default: false,
    });

    yargs.option('plugin-path', {
        alias: 'P',
        describe: 'Additional paths to look for plugins at as well as the default location ([path] can also point to a single plugin)',
        type: 'array',
    });
    yargs.option('data-path', {
        aliases: ['U', 'user-storage-path'],
        describe: 'Path to look for Homebridge data',
        type: 'string',
    });
}, async argv => {
    const config_path = path.resolve(process.cwd(), argv.config);
    let config;

    try {
        const config_json = fs.readFileSync(config_path);
        config = JSON.parse(config_json);
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            console.error('The configuration file (' + config_path + ') doesn\'t exist.');
        } else if (error instanceof SyntaxError) {
            console.error('Syntax error reading configuration file (' + config_path + '):', error.message);
        } else {
            console.error('Error reading configuration file (' + config_path + '):', error);
        }

        process.exit(1);
    }

    HomebridgeUser.configPath = () => config_path;
    HomebridgeUser.config = () => config;

    const data_path = argv['data-path'] ? path.resolve(process.cwd(), argv['data-path'])
        : config['data-path'] ? path.resolve(path.dirname(config_path), config['data-path'])
            // : path.resolve(os.homedir(), '.homebridge');
            : path.dirname(config_path);

    HomebridgeUser.setStoragePath(data_path);

    HomebridgeLogger.setDebugEnabled(Logger.enable_debug = argv.debug);
    HomebridgeLogger.setTimestampEnabled(Logger.enable_timestamps = argv.timestamps);
    if (argv['force-colour']) HomebridgeLogger.forceColor(), forceColourLogs();

    const show_qr_code = argv['print-setup'];
    const unauthenticated_access = argv['allow-unauthenticated'];

    for (let plugin_path of argv['plugin-path'] || []) {
        HomebridgePluginManager.addPluginPath(path.resolve(process.cwd(), plugin_path));
    }

    if (typeof config['plugin-path'] === 'string') {
        HomebridgePluginManager.addPluginPath(path.resolve(path.dirname(config_path), config['plugin-path']));
    } else if (config['plugin-path'] instanceof Array) for (let plugin_path of config['plugin-path']) {
        HomebridgePluginManager.addPluginPath(path.resolve(path.dirname(config_path), plugin_path));
    }

    log.info('Starting Homebridge with configuration file', HomebridgeUser.configPath());
    log.debug('Data path:', HomebridgeUser.storagePath());
    log.debug('Persist path:', HomebridgeUser.persistPath());
    log.debug('Accessory cache path:', HomebridgeUser.cachedAccessoryPath());
    log.debug('Plugin paths:', HomebridgePluginManager.paths);
    log.debug('UI storage path:', path.resolve(data_path, 'ui-storage'));

    homebridge_logger.prefix = 'Homebridge';

    // Initialize HAP-NodeJS with a custom persist directory
    hap.init(HomebridgeUser.persistPath());

    const server = await Server.createServer({
        data_path,
        config_path,
        config,
    });

    const http_server = server.createServer();
    http_server.listen(8080);

    server.publish();

    for (let bridge of server.bridges) {
        // Bridge has already been paired with
        if (bridge.bridge._accessoryInfo && bridge.bridge._accessoryInfo.pairedClients.length) continue;

        bridge.printSetupInfo();
    }
});

yargs.command('version', 'Show version number', yargs => {}, async argv => {
    console.log('homebridge-web-ui version', require('../package').version);
    console.log('homebridge version', require('homebridge/package').version);
    console.log('hap-nodejs version', require('hap-nodejs/package').version);
});

yargs.scriptName('homebridge-web-ui').help().version(false);
const _argv = yargs.argv;
