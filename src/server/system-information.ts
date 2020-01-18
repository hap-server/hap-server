import {
    Systeminformation as systeminformation,
    system as getSystemInfo, osInfo as getOsInfo, currentLoad as getLoadInfo,
    cpu as getCpuInfo, mem as getMemoryInfo, battery as getBatteryInfo,
    fsSize as getFsSizeInfo, networkInterfaces as getNetworkInterfaces, time as getTimeInfo,
} from 'systeminformation';
import * as os from 'os';
import * as semver from 'semver';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const start_time = Date.now();
const DEVELOPMENT = true;

export enum BuildType {
    DEVELOPMENT,
    RELEASE,
}

export interface Versions {
    'hap-server': string;
    homebridge: string;
    homebridgeApi: string | null;
    'hap-nodejs': string;
    nodejs: string;
    v8: string;
    modules: string;
    npm: string | null;
}

export interface Battery {
    cyclecount: number;
    ischarging: boolean;
    maxcapacity: number;
    currentcapacity: number;
    percent: number;
    timeremaining: number;
    acconnected: boolean;
    type: string;
    model: string;
    manufacturer: string;
    serial: string;
}

export interface NetworkInterface {
    name: string;
    display_name: string;
    ip_addresses: os.NetworkInterfaceInfo[];
    info: systeminformation.NetworkInterfacesData;
}

export interface SystemInformationData {
    build: keyof typeof BuildType;
    versions: Versions;
    updates: Partial<Versions>;
    system: systeminformation.SystemData;
    os: systeminformation.OsData;
    cpu: systeminformation.CpuData;
    load: systeminformation.CurrentLoadData;
    memory: systeminformation.MemData;
    batteries: Battery[];
    fs: systeminformation.FsSizeData[];
    network: NetworkInterface[];
    time: systeminformation.TimeData;
    start_time: number;
    uptime: number;
}

interface SystemInformationSubscriber {
    updateSystemInformation(data: Partial<SystemInformationData>): void;
}

export class SystemInformation {
    constructor() {}

    async getSystemInformation(): Promise<SystemInformationData> {
        const [versions, updates, system, os, cpu, load, memory, battery, fs, network] = await Promise.all([
            this.getVersions(), this.getUpdates(),
            getSystemInfo(), getOsInfo(), getCpuInfo(), getLoadInfo(), getMemoryInfo(), getBatteryInfo(),
            getFsSizeInfo(), this.getNetworkInterfaces(),
        ]);

        return {
            build: BuildType[this.getHapServerBuildType()] as keyof typeof BuildType,
            versions: versions as Versions,
            updates,
            system,
            os,
            cpu,
            load,
            memory,
            batteries: battery.hasbattery ? [battery] : [],
            fs,
            network,
            time: getTimeInfo(),
            start_time,
            uptime: Date.now() - start_time,
        };
    }

    private subscribers = new Set<SystemInformationSubscriber>();
    private subscribe_timeout: NodeJS.Timeout | null = null;

    subscribe(dep: SystemInformationSubscriber) {
        this.subscribers.add(dep);

        if (this.subscribe_timeout === null) {
            this.subscribe_timeout = setTimeout(this._subscribe_callback, 5000);
        }
    }

    unsubscribe(dep: SystemInformationSubscriber) {
        this.subscribers.delete(dep);

        clearTimeout(this.subscribe_timeout!);
        this.subscribe_timeout = null;
    }

    // eslint-disable-next-line no-invalid-this
    private _subscribe_callback = this.updateData.bind(this);

    async updateData() {
        try {
            const [updates, cpu, load, memory, battery, fs, network] = await Promise.all([
                this.getUpdates(),
                getCpuInfo(), getLoadInfo(), getMemoryInfo(), getBatteryInfo(),
                getFsSizeInfo(), this.getNetworkInterfaces(),
            ]);

            const data: Partial<SystemInformationData> = {
                updates,
                cpu,
                load,
                memory,
                batteries: battery.hasbattery ? [battery] : [],
                fs,
                network,
                time: getTimeInfo(),
                uptime: Date.now() - start_time,
            };

            for (const subscriber of this.subscribers) {
                subscriber.updateSystemInformation(data);
            }
        } catch (err) {
            //
        }

        clearTimeout(this.subscribe_timeout!);
        this.subscribe_timeout = this.subscribers.size ? setTimeout(this._subscribe_callback, 5000) : null;
    }

    getVersions(): Versions {
        return {
            'hap-server': require('..').version,
            homebridge: require('homebridge/package').version,
            homebridgeApi: this.getHomebridgeApiVersion(),
            'hap-nodejs': require('hap-nodejs/package').version,

            nodejs: process.versions.node,
            v8: process.versions.v8,
            modules: process.versions.modules,
            npm: this.getNpmVersion(),
        };
    }

    getHapServerBuildType(): BuildType {
        return DEVELOPMENT ? BuildType.DEVELOPMENT : BuildType.RELEASE;
    }

    getHomebridgeApiVersion() {
        const match = require('homebridge/lib/api').API.toString()
            .match(/\.(\s|\n)*version(\s|\n)*=(\s|\n)*([0-9]+(\.[0-9]+)?)(;|$)/m);

        return match ? match[4] : null;
    }

    getNpmVersion() {
        try {
            return require('npm/package').version;
        } catch (err) {}

        for (const search_path of process.env.PATH ? process.env.PATH.split(':') : []) {
            if (!search_path.endsWith(path.sep + 'bin')) continue;

            try {
                return require(path.resolve(search_path, '..', 'lib', 'node_modules', 'npm', 'package')).version;
            } catch (err) {}
        }

        return null;
    }

    async getUpdates() {
        const installed_versions = this.getVersions();
        const latest_versions = await this.getLatestVersions();

        const updates: Partial<Versions> = {};

        for (const [name, latest_version] of Object.entries(latest_versions) as [keyof Versions, string][]) {
            const installed_version = installed_versions[name];

            if (installed_version && semver.gt(latest_version, '' + installed_version, {
                loose: true,
            })) {
                updates[name] = latest_version;
            }
        }

        return updates;
    }

    private latest_versions: Promise<Partial<Versions>> | null = null;
    private latest_versions_expire: number | null = null;
    private latest_versions_ttl = 60000 * 60; // 1 hour

    async getLatestVersions(): Promise<Partial<Versions>> {
        if (this.latest_versions && (!this.latest_versions_expire || this.latest_versions_expire > Date.now())) {
            return this.latest_versions;
        }

        this.latest_versions_expire = null;
        return this.latest_versions = this._getLatestVersions().then(v => {
            this.latest_versions_expire = Date.now() + this.latest_versions_ttl;
            return v;
        }, err => {
            this.latest_versions = null;
            throw err;
        });
    }

    private async _getLatestVersions(): Promise<Partial<Versions>> {
        const [hapserver, homebridge, hapnodejs, nodejs, npm] = await Promise.all([
            require('..').private ? undefined :
                this.getLatestNpmPackageVersion(require('..').name).catch(e => undefined),
            require('homebridge/package').private ? undefined :
                this.getLatestNpmPackageVersion('homebridge').catch(e => undefined),
            require('hap-nodejs/package').private ? undefined :
                this.getLatestNpmPackageVersion('hap-nodejs').catch(e => undefined),

            this.getLatestNodeJsVersion().catch(e => undefined),
            this.getLatestNpmPackageVersion('npm').catch(e => undefined),
        ]);

        return {
            'hap-server': hapserver,
            homebridge,
            'hap-nodejs': hapnodejs,
            nodejs,
            npm,
        };
    }

    async getLatestNpmPackageVersion(name: string): Promise<string> {
        return new Promise<string>((rs, rj) => https.get(`https://registry.npmjs.org/${name}`, res => {
            let data = '';
            res.on('data', chunk => data += chunk.toString('utf-8'));
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) return rj(new Error('Received status code ' + res.statusCode));
                    const response = JSON.parse(data);
                    rs(response['dist-tags'].latest);
                } catch (err) {
                    rj(err);
                }
            });
        }).on('error', err => {
            rj(err);
        }));
    }

    async getLatestNodeJsVersion(): Promise<string> {
        return new Promise<string>((rs, rj) => https.get('https://nodejs.org/dist/latest/', res => {
            let data = '';
            res.on('data', chunk => data += chunk.toString('utf-8'));
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) return rj(new Error('Received status code ' + res.statusCode));

                    const regex = /node-v(\d+\.\d+\.\d+)-([a-z]+)-([a-z0-9]+)\./g;
                    let match;

                    while (match = regex.exec(data)) {
                        const [, version, platform, arch] = match;
                        if (process.platform === 'win32' ? platform !== 'win' : process.platform !== platform) continue;
                        if (process.arch !== arch) continue;

                        return rs(version);
                    }

                    rj(new Error('No versions available for the current platform'));
                } catch (err) {
                    rj(err);
                }
            });
        }).on('error', err => {
            rj(err);
        }));
    }

    async getNetworkInterfaces(): Promise<NetworkInterface[]> {
        const interfaces = await getNetworkInterfaces();
        const addresses = os.networkInterfaces();

        return interfaces.map(i => ({
            name: i.iface,
            display_name: i.ifaceName,
            ip_addresses: addresses[i.iface] || [],
            info: i,
        }));
    }
}

const instance = new SystemInformation();
export default instance;
