import path from 'path';
import process from 'process';
import fs from 'fs';

import yargs from 'yargs';
import chalk from 'chalk';

import {PluginManager, Logger, forceColourLogs} from '..';

export const log = new Logger();

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

export function getConfig(argv) {
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

export async function connect(argv) {
    const Connection = require('./common/connection').default;
    const WebSocket = require('ws');

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

    log.debug('Connecting to', `ws://${http_host}:${http_port}/websocket`);
    const connection = await Connection.connect(`ws://${http_host}:${http_port}/websocket`, WebSocket);

    const authenticated_user = await connection.authenticateWithCliToken(cli_auth_token);
    log.debug('Authenticated user', authenticated_user);

    return [connection, authenticated_user, config, config_path, data_path, server_pid];
}

function command(file, command, describe) {
    yargs.command(command, describe, function(yargs) {
        return require(file).builder.call(null, yargs);
    }, function(argv) {
        return require(file).handler.call(null, argv);
    });
}

command('./server', '$0 [config]', 'Run the HAP and web server', './server');
command('./get-characteristics', 'get-characteristics <config> <characteristics>', 'Get characteristics');
command('./set-characteristic', 'set-characteristic <config> <characteristic> <value>', 'Set a characteristic');

yargs.command('version', 'Show version number', yargs => {}, async argv => {
    console.log('hap-server version', require('.').version, DEVELOPMENT ? chalk.red('development') : chalk.grey('production'));
    console.log('homebridge version', require('homebridge/package').version);
    console.log('hap-nodejs version', require('hap-nodejs/package').version);
});

yargs.scriptName('hap-server').help().version(false).showHelpOnFail(false, 'Specify --help for available options');

export default yargs;
