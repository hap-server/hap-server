import path from 'path';
import process from 'process';
import fs from 'fs';
import util from 'util';
import os from 'os';

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

export interface GlobalArguments {
    debug: boolean;
    timestamps: boolean;
    forceColour: boolean;

    _: string[];
}

import ConfigurationFileData, {
    validate, Warning,
    AutomationTriggerConfiguration, AutomationConditionConfiguration, AutomationActionConfiguration,
} from './configuration';

interface ConfigData {
    config: ConfigurationFileData;
    config_path: string;
    data_path: string;
}

function resolveTidle(pathname: string) {
    if (pathname === '~') return os.homedir();
    if (pathname.startsWith('~' + path.sep)) return path.join(os.homedir(), pathname.substr(1 + path.sep.length));
    return pathname;
}

export function getConfig(argv: GlobalArguments): ConfigData {
    /**
     * Read configuration data.
     */

    // @ts-ignore
    const config_path = path.resolve(process.cwd(), resolveTidle(argv.config));
    let config;

    try {
        const config_cache: Record<string, any> = {};

        function requireConfig(config_path: string) {
            if (config_cache[config_path]) {
                return config_cache[config_path];
            }

            try {
                const config_string = fs.readFileSync(config_path, 'utf-8');

                if (['.yml', '.yaml'].includes(path.extname(config_path))) {
                    return config_cache[config_path] = yaml.parse(config_string, {
                        // @ts-ignore
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

        function mapIncludes(config_path: string, value: any) {
            if (typeof value === 'string' && value.startsWith('include ')) {
                return requireConfig(path.resolve(path.dirname(config_path), resolveTidle(value.substr(8))));
            } else if (Object.keys(value).length === 1 && value.include) {
                return requireConfig(path.resolve(path.dirname(config_path), resolveTidle(value.include)));
            }

            return value;
        }

        config = requireConfig(config_path);

        if (config.plugins) {
            config.plugins = Object.entries(config.plugins)
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {} as Record<string, any>);
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
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {} as Record<string, AutomationTriggerConfiguration>);
        }
        if (config['automation-conditions']) {
            config['automation-conditions'] = Object.entries(config['automation-conditions'])
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {} as Record<string, AutomationConditionConfiguration>);
        }
        if (config['automation-actions']) {
            config['automation-actions'] = Object.entries(config['automation-actions'])
                .map(([key, value]) => [key, mapIncludes(config_path, value)])
                .reduce((acc, [key, value]) => (acc[key] = value, acc), {} as Record<string, AutomationActionConfiguration>);
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

    // @ts-ignore
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

export async function connect(argv: GlobalArguments): Promise<ConnectionData> {
    const {default: Connection} = await import('../client/connection');
    const {default: WebSocket} = await import('ws');

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
command('./hap-pair', 'hap-pair <host> <port>', 'Pair with a HomeKit accessory');

interface ValidateConfigurationArguments extends GlobalArguments {
    strict: boolean;
}

yargs.command('validate-configuration <config>', 'Validates a configuration file', yargs => {
    yargs.option('strict', {
        alias: 'S',
        describe: 'Exit with an error code for warnings',
        type: 'boolean',
        default: false,
    });
}, async (argv: ValidateConfigurationArguments) => {
    const {config, config_path, data_path} = getConfig(argv);
    const errors = await validate(config, data_path);

    if (!errors.length) {
        log.info('No errors.');
    } else {
        const warnings = errors.filter(e => e instanceof Warning);
        const onlyerrors = errors.filter(e => !(e instanceof Warning));

        if (!warnings.length || !onlyerrors.length) {
            log.info((warnings.length === 1 ? '%d warning' : '%d error') + (errors.length === 1 ? '.' : 's.'),
                errors.length);
        } else {
            log.info(`%d error${onlyerrors.length === 1 ? '' : 's'} and %d warning${warnings.length === 1 ? '' : 's'}.`,
                onlyerrors.length, warnings.length);
        }
    }

    for (const error of errors) {
        if (error instanceof Warning) {
            console.warn(chalk[argv.strict ? 'red' : 'yellow']('[Warning]'), error.message);
        } else {
            console.error(chalk.red('[Error]'), error.message);
        }
    }

    if (errors.find(e => argv.strict || !(e instanceof Warning))) return process.exit(1);
});

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
