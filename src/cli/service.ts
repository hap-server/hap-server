/// <reference path="../types/simple-plist.d.ts" />

import {log, GlobalArguments} from '.';
import {package_path} from '..';

import * as read from 'read';
import * as util from 'util';
import * as path from 'path';
import {promises as fs} from 'fs';
import * as child_process from 'child_process';
const prompt = util.promisify(read) as (opts: read.Options) => Promise<string>;
import * as plist from 'simple-plist';
import _mkdirp = require('mkdirp');
const mkdirp = util.promisify(_mkdirp) as (dir: string) => Promise<_mkdirp.Made>;
import _glob = require('glob');
const glob = util.promisify(_glob) as {
    (pattern: string, options?: _glob.IOptions): Promise<string[]>;
};

const DEVELOPMENT = true;

export const command = 'service <command>';
export const describe = 'Manage the system service for hap-server';

export function builder(yargs: typeof import('yargs')) {
    const service_controller = getServiceController();

    yargs.positional('command', {
        type: 'string',
        required: true,
    });

    yargs.option('service-name', {
        describe: 'Service name to identify multiple services',
        type: 'string',
        default: 'server',
    });
    yargs.option('data-path', {
        describe: 'Path to store hap-server configuration and data',
        type: 'string',
        default: service_controller?.getDefaultDataPath('server'),
    });
    yargs.option('stdout-path', {
        describe: 'Path to redirect output to',
        type: 'string',
        default: service_controller?.getDefaultStdoutPath('server'),
    });
    yargs.option('stderr-path', {
        describe: 'Path to redirect error output to',
        type: 'string',
        default: service_controller?.getDefaultStderrPath('server'),
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

    yargs.option('user', {
        alias: 'u',
        describe: 'User to run as after starting',
    });
    yargs.option('group', {
        alias: 'g',
        describe: 'Group to run as after starting',
    });
}

interface Arguments extends GlobalArguments {
    command: 'status' | 'install' | 'uninstall';
    serviceName: string;
    dataPath: string;
    stdoutPath: string;
    stderrPath: string;
    advertiseWebInterface: boolean;
    advertiseWebInterfacePort: number;
    user?: string;
    group?: string;
}

export async function handler(argv: Arguments) {
    const service_controller = getServiceController();
    if (!service_controller) throw new Error('Unsupported platform');

    // if (argv.command === 'status') return handleStatus(service_controller, argv);
    if (argv.command === 'install') return handleInstall(service_controller, argv);
    if (argv.command === 'uninstall') return handleUninstall(service_controller, argv);

    throw new Error('Invalid command');
}

function handleStatus(service_controller: ServiceController, argv: Arguments) {
    //
}

function handleInstall(service_controller: ServiceController, argv: Arguments) {
    service_controller.install(argv.serviceName, {
        data_path: argv.dataPath,
        stdout: argv.stdoutPath,
        stderr: argv.stderrPath,
        advertise: argv.advertiseWebInterface ? {
            port: argv.advertiseWebInterfacePort,
        } : null,
        user: argv.user || null,
        group: argv.group || null,
    });
}

function handleUninstall(service_controller: ServiceController, argv: Arguments) {
    service_controller.uninstall(argv.serviceName);
}

interface ServiceInstallOptions {
    data_path: string;
    stdout: string;
    stderr: string;
    advertise: {port: number} | null;
    user: string | null;
    group: string | null;
}

abstract class ServiceController {
    service_namespace = 'hap-server.';
    require_superuser = true;

    async install(service_name: string, options: ServiceInstallOptions) {
        if (this.require_superuser && process.getuid() !== 0) {
            throw new Error('This command must be run as root');
        }

        const configuration = this.generateServiceConfiguration(service_name, options);
        const configuration_path = this.getServiceConfigurationPath(service_name);

        log.info('Creating data directory');
        await mkdirp(options.data_path);

        const config_path = path.resolve(options.data_path, 'config.yaml');
        if (!await fs.stat(config_path).then(stat => true, err => false)) {
            log.info('Creating configuration file');
            await fs.writeFile(config_path, this.getDefaultConfiguration(), 'utf-8');
            // Owner and group: read/write, everyone: none
            await fs.chmod(config_path, 0o660);
            log.warn('Created default configuration file at %s. You should add your own configuration to this file.',
                config_path);
        }

        if (options.user) {
            const userid = await import('userid');
            const uid_gid = userid.ids(options.user);
            const uid = uid_gid.uid;
            const gid = options.group ? userid.gid(options.group) : uid_gid.gid;

            log.info('Setting data directory permissions');
            await fs.chown(options.data_path, uid, gid);
            await Promise.all((await glob('**', {
                cwd: options.data_path,
            })).map(async p => {
                if (['cli-token', 'hap-server-port', 'hap-server.pid'].includes(p)) return;

                if (p.indexOf('/') === -1) {
                    // The root data directory should only contain configuration files, `cli-token`, `hap-server-port`,
                    // `hap-server.pid` and sockets
                    if (['.yaml', '.yml', '.json'].find(e => p.endsWith(e))) return;

                    const stat = await fs.stat(path.join(options.data_path, p));
                    if (!stat.isDirectory() && !stat.isFile()) return;
                }

                await fs.chown(path.join(options.data_path, p), uid, gid);
                const stat = await fs.stat(path.join(options.data_path, p));
                if (stat.isFile()) {
                    // Owner and group: read/write, everyone: none
                    await fs.chmod(path.join(options.data_path, p), 0o660);
                } else if (stat.isDirectory()) {
                    // Owner: read/write/execute, group: read/execute, everyone: none
                    await fs.chmod(path.join(options.data_path, p), 0o750);
                }
            }));

            log.info('Setting log file permissions');
            if (!await fs.stat(options.stdout).then(stat => true, err => false)) {
                await fs.writeFile(options.stdout, Buffer.alloc(0));
                // Owner: read/write, group/everyone: read
                await fs.chmod(options.stdout, 0o664);
            }
            await fs.chown(options.stdout, uid, gid);
            if (options.stdout !== options.stderr) {
                if (!await fs.stat(options.stderr).then(stat => true, err => false)) {
                    await fs.writeFile(options.stderr, Buffer.alloc(0));
                    // Owner: read/write, group/everyone: read
                    await fs.chmod(options.stderr, 0o664);
                }
                await fs.chown(options.stderr, uid, gid);
            }
        }

        log.info('Writing service configuration file to %s', configuration_path);
        await fs.writeFile(configuration_path, configuration, 'utf-8');
    }

    async uninstall(service_name: string) {
        const configuration_path = this.getServiceConfigurationPath(service_name);

        log.info('Deleting service configuration file from %s', configuration_path);
        await fs.unlink(configuration_path);

        log.info('Uninstalled hap-server service');
        log.info('Data and logs *have not* been removed');
    }

    abstract getServiceConfigurationPath(service_name: string): string;
    abstract generateServiceConfiguration(service_name: string, options: ServiceInstallOptions): string;
    abstract getDefaultDataPath(service_name: string): string;
    abstract getDefaultStdoutPath(service_name: string): string;
    abstract getDefaultStderrPath(service_name: string): string;

    getDefaultConfiguration() {
        return `listen:
  # Listen on a UNIX socket
  - unix:hap-server.sock

  # Listen on any available port
  # You should change this to a static port number
  # - 0
`;
    }
}

function getServiceController() {
    switch (process.platform) {
        case 'darwin':
            return new LaunchdService();
        case 'linux':
            return new SystemdService();
        default:
            return null;
    }
}

class LaunchdService extends ServiceController {
    service_namespace = 'uk.org.fancy.hap-server.';

    async install(service_name: string, options: ServiceInstallOptions) {
        await super.install(service_name, options);

        const configuration_path = this.getServiceConfigurationPath(service_name);

        log.info('Loading service into launchd', configuration_path);
        await new Promise((rs, rj) => child_process.spawn('launchctl', [
            'load',
            configuration_path,
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('launchctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));
    }

    async uninstall(service_name: string) {
        const configuration_path = this.getServiceConfigurationPath(service_name);

        log.info('Unloading service from launchd', configuration_path);
        await new Promise((rs, rj) => child_process.spawn('launchctl', [
            'unload',
            configuration_path,
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('launchctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));

        await super.uninstall(service_name);
    }

    getServiceConfigurationPath(service_name: string) {
        return `/Library/LaunchDaemons/${this.service_namespace}${service_name}.plist`;
    }

    getDefaultDataPath(service_name: string) {
        return `/Library/Application Support/${this.service_namespace}${service_name}`;
    }

    getDefaultStdoutPath(service_name: string) {
        return `/Library/Logs/${this.service_namespace}${service_name}.log`;
    }

    getDefaultStderrPath(service_name: string) {
        return `/Library/Logs/${this.service_namespace}${service_name}.log`;
    }

    generateServiceConfiguration(service_name: string, options: ServiceInstallOptions) {
        return plist.stringify({
            Label: this.service_namespace + service_name,
            ProgramArguments: [
                path.resolve(package_path, 'bin', 'hap-server'),
                '--force-colour',
                DEVELOPMENT ? '--no-webpack-hot' : undefined,
                options.advertise ? '--advertise-web-interface' : undefined,
                options.advertise ? '--advertise-web-interface-port' : undefined,
                options.advertise ? '' + options.advertise.port : undefined,
                path.resolve(options.data_path, 'config.yaml'),
            ],
            UserName: options.user || undefined,
            GroupName: options.group || undefined,
            WorkingDirectory: options.data_path,
            EnvironmentVariables: {
                PATH: `${process.env.PATH || '/bin'}:$PATH`,
            },
            StandardOutPath: options.stdout,
            StandardErrorPath: options.stderr,
            RunAtLoad: true,
            KeepAlive: true,
        });
    }
}

class SystemdService extends ServiceController {
    async install(service_name: string, options: ServiceInstallOptions) {
        await super.install(service_name, options);

        const configuration_path = this.getServiceConfigurationPath(service_name);

        log.info('Reloading systemd');
        await new Promise((rs, rj) => child_process.spawn('systemctl', [
            'reload',
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('systemctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));

        log.info('Enabling and starting systemd service', configuration_path);
        await new Promise((rs, rj) => child_process.spawn('systemctl', [
            'enable',
            configuration_path,
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('systemctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));
        await new Promise((rs, rj) => child_process.spawn('systemctl', [
            'start',
            configuration_path,
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('systemctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));
    }

    async uninstall(service_name: string) {
        const configuration_path = this.getServiceConfigurationPath(service_name);

        log.info('Stopping and disabling systemd service', configuration_path);
        await new Promise((rs, rj) => child_process.spawn('systemctl', [
            'stop',
            configuration_path,
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('systemctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));
        await new Promise((rs, rj) => child_process.spawn('systemctl', [
            'disable',
            configuration_path,
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('systemctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));

        await super.uninstall(service_name);

        log.info('Reloading systemd');
        await new Promise((rs, rj) => child_process.spawn('systemctl', [
            'reload',
        ], {
            stdio: 'inherit',
        }).on('close', (code, signal) => {
            code === 0 ? rs() :
                rj(new Error('systemctl exited with code ' + code + (signal ? ' (signal ' + signal + ')' : '')));
        }));
    }

    getServiceConfigurationPath(service_name: string) {
        return `/etc/systemd/system/${this.service_namespace}${service_name}.service`;
    }

    getDefaultDataPath(service_name: string) {
        return `/var/lib/${this.service_namespace}${service_name}`;
    }

    getDefaultStdoutPath(service_name: string) {
        return `/var/log/${this.service_namespace}${service_name}.log`;
    }

    getDefaultStderrPath(service_name: string) {
        return `/var/log/${this.service_namespace}${service_name}.log`;
    }

    generateServiceConfiguration(service_name: string, options: ServiceInstallOptions) {
        const command = ([
            path.resolve(package_path, 'bin', 'hap-server'),
            '--force-colour',
            DEVELOPMENT ? '--no-webpack-hot' : undefined,
            options.advertise ? '--advertise-web-interface' : undefined,
            options.advertise ? '--advertise-web-interface-port' : undefined,
            options.advertise ? '' + options.advertise.port : undefined,
            path.resolve(options.data_path, 'config.yaml'),
        ].filter(a => a) as string[]).map(a => {
            return a.indexOf(' ') === -1 ? a : `'${a}'`;
        });

        return `[Unit]
Description=${this.service_namespace}${service_name}
After=syslog.target network-online.target

[Service]
Type=simple
User=${options.user}
Group=${options.group}
PermissionsStartOnly=true
ExecStart=${command}
WorkingDirectory=${options.data_path}
PIDFile=${path.join(options.data_path, 'hap-server.pid')}
StandardOutput=append:${options.stdout}
StandardError=append:${options.stderr}
Restart=always
RestartSec=3
KillMode=process

[Install]
WantedBy=multi-user.target
`;
    }
}
