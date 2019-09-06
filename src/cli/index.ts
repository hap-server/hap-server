import path from 'path';
import process from 'process';
import fs from 'fs';
import util from 'util';

import yargs from 'yargs';
import chalk from 'chalk';
import yaml from 'yaml';

import {PluginManager, Logger, forceColourLogs, version} from '..';

export const log = new Logger();

const readFile = util.promisify(fs.readFile);

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

import ConfigurationFileData from './configuration';

interface ConfigData {
    config: ConfigurationFileData;
    config_path: string;
    data_path: string;
}

export function getConfig(argv): ConfigData {
    /**
     * Read configuration data.
     */

    const config_path = path.resolve(process.cwd(), argv.config);
    let config;

    try {
        const config_cache = {};

        function requireConfig(config_path: string) {
            if (config_cache[config_path]) {
                return config_cache[config_path];
            }

            try {
                const config_string = fs.readFileSync(config_path, 'utf-8');

                if (['.yml', '.yaml'].includes(path.extname(config_path))) {
                    return config_cache[config_path] = yaml.parse(config_string, {
                        prettyErrors: true,
                    });
                } else {
                    return config_cache[config_path] = JSON.parse(config_string);
                }
            } catch (err) {
                err.config_path = config_path;
                throw err;
            }
        }

        function mapIncludes(config_path: string, value) {
            if (typeof value === 'string' && value.startsWith('include ')) {
                return requireConfig(path.resolve(path.dirname(config_path), value.substr(8)));
            } else if (Object.keys(value).length === 1 && value.include) {
                return requireConfig(path.resolve(path.dirname(config_path), value.include));
            }

            return value;
        }

        config = requireConfig(config_path);

        if (config.plugins) {
            config.plugins = Object.entries(config.plugins)
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {});
        }
        if (config.accessories) config.accessories = config.accessories.map(mapIncludes.bind(null, config_path));
        if (config.platforms) config.platforms = config.platforms.map(mapIncludes.bind(null, config_path));
        if (config.bridges) config.bridges = config.bridges.map(mapIncludes.bind(null, config_path));
        if (config.accessories2) config.accessories2 = config.accessories2.map(mapIncludes.bind(null, config_path));
        if (config.platforms2) config.platforms2 = config.platforms2.map(mapIncludes.bind(null, config_path));
        if (config.automations) config.automations = config.automations.map(mapIncludes.bind(null, config_path));
        if (config['automation-triggers']) {
            config['automation-triggers'] = Object.entries(config['automation-triggers'])
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {});
        }
        if (config['automation-conditions']) {
            config['automation-conditions'] = Object.entries(config['automation-conditions'])
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {});
        }
        if (config['automation-actions']) {
            config['automation-actions'] = Object.entries(config['automation-actions'])
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {});
        }
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            console.error(chalk.red(`The configuration file (${error.config_path}) doesn\'t exist.`));
        } else if (error instanceof SyntaxError) {
            console.error(chalk.red(`Syntax error reading configuration file (${(error as any).config_path}):`), error.message);
        } else {
            console.error(chalk.red(`Error reading configuration file (${error.config_path}):`), error);
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

    return {config, config_path, data_path};
}

import {Connection, AuthenticatedUser} from '../client';

interface ConnectionData extends ConfigData {
    connection: Connection;
    authenticated_user: AuthenticatedUser;
    // config,
    // config_path,
    // data_path,
    server_pid: number;
}

export async function connect(argv): Promise<ConnectionData> {
    const Connection = require('../client/connection').default;
    const WebSocket = require('ws');

    const {config, config_path, data_path} = await getConfig(argv);

    Logger.enable_debug = argv.debug;
    Logger.enable_timestamps = argv.timestamps;
    if (argv.forceColour) forceColourLogs();

    log.debug('Arguments', argv);

    const cli_auth_token_bytes = await readFile(path.join(data_path, 'cli-token'));
    const cli_auth_token = cli_auth_token_bytes.toString('hex');

    const server_pid = parseInt(await readFile(path.join(data_path, 'hap-server.pid'), 'utf-8'));
    const http_port = parseInt(await readFile(path.join(data_path, 'hap-server-port'), 'utf-8'));

    const http_host = config.http_host && !['::', '0.0.0.0'].includes(config.http_host) ?
        config.http_host.match(/[^0-9.]/) ? `[${config.http_host}]` : config.http_host : '127.0.0.1';

    log.debug('Connecting to', `ws://${http_host}:${http_port}/websocket`);
    const connection = await Connection.connect(`ws://${http_host}:${http_port}/websocket`, WebSocket);

    const authenticated_user = await connection.authenticateWithCliToken(cli_auth_token);
    log.debug('Authenticated user', authenticated_user);

    return {connection, authenticated_user, config, config_path, data_path, server_pid};
}

function command(file: string, command: string, describe: string) {
    yargs.command(command, describe, function(yargs) {
        return require(file).builder.call(null, yargs);
    }, function(argv) {
        return require(file).handler.call(null, argv);
    });
}

command('./server', '$0 [config]', 'Run the HAP and web server');
command('./make-admin', 'make-admin <user>', 'Promote a user to administrator');
command('./get-characteristics', 'get-characteristics <config> <characteristics>', 'Get characteristics');
command('./set-characteristic', 'set-characteristic <config> <characteristic> <value>', 'Set a characteristic');

function homebridgeApiVersion() {
    const match = require('homebridge/lib/api').API.toString()
        .match(/\.(\s|\n)*version(\s|\n)*=(\s|\n)*([0-9]+(\.[0-9]+)?)(;|$)/m);

    return match ? parseFloat(match[4]) : null;
}

yargs.command('version', 'Show version number', yargs => {}, async argv => {
    console.log('hap-server version %s %s', version, DEVELOPMENT ? chalk.red('development') : chalk.grey('production'));
    console.log('homebridge version %s, API %s', require('homebridge/package').version,
        homebridgeApiVersion() || chalk.yellow('unknown'));
    console.log('hap-nodejs version %s', require('hap-nodejs/package').version);
});

yargs.scriptName('hap-server').help().version(false).showHelpOnFail(false, 'Specify --help for available options');

export default yargs;
