import {
    Systeminformation as systeminformation,
    system as getSystemInfo, osInfo as getOsInfo, currentLoad as getLoadInfo,
    cpu as getCpuInfo, mem as getMemoryInfo, battery as getBatteryInfo,
    fsSize as getFsSizeInfo, networkInterfaces as getNetworkInterfaces, time as getTimeInfo,
} from 'systeminformation';
import * as os from 'os';
import * as semver from 'semver';
import * as https from 'https';
import * as path from 'path';

const start_time = Date.now();
const DEVELOPMENT = true;

const NPM_REGISTRY_PACKAGE_URL = (name: string) => `https://registry.npmjs.org/${name}`;
const NODEJS_VERSIONS_URL = 'https://nodejs.org/dist/index.json';
const NODEJS_RELEASE_SCHEDULE_URL = 'https://raw.githubusercontent.com/nodejs/Release/master/schedule.json';

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

export interface LatestVersions extends Partial<Versions> {
    /** All current/LTS versions */
    nodejs_all?: {
        current: string;
        /** Maps LTS codenames to the latest version */
        lts: Record<string, string>;
    };
    nodejs_schedule?: NodeJsScheduledReleases;
    /** Maps active LTS codenames to the latest version */
    nodejs_lts?: Record<string, string>;
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

interface NodeJsRelease {
    version: string;
    date: string;
    files: string[];
    npm?: string; // Only versions older than v0.6.2 don't include npm
    v8: string;
    uv?: string;
    zlib?: string;
    openssl?: string;
    modules?: string;
    lts: string | false;
    security: boolean;
}

interface NodeJsScheduledRelease {
    start: string;
    lts?: string;
    maintenance?: string;
    end: string;
    codename?: string;
}

interface NodeJsScheduledReleases {
    [key: string]: NodeJsScheduledRelease;
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

        if (installed_versions.nodejs && latest_versions.nodejs && latest_versions.nodejs_lts) {
            const nodejs_major = semver.coerce(installed_versions.nodejs)!.major;
            let is_active_lts: string | null = null;

            for (const [codename, latest_version] of Object.entries(latest_versions.nodejs_lts)) {
                const lts_major = semver.coerce(latest_version)!.major;
                if (lts_major !== nodejs_major) continue;

                is_active_lts = codename;
                if (semver.gt(latest_version, installed_versions.nodejs)) updates.nodejs = latest_version;
            }

            if (!is_active_lts && semver.gt(latest_versions.nodejs, installed_versions.nodejs)) {
                updates.nodejs = latest_versions.nodejs;
            }
        }

        for (const [name, latest_version] of Object.entries(latest_versions) as [keyof Versions, string][]) {
            if (name === 'nodejs') continue;

            const installed_version = installed_versions[name];
            if (!installed_version || !latest_version) continue;

            if (semver.gt(latest_version, '' + installed_version, {
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

    async getLatestVersions(): Promise<LatestVersions> {
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

    private async _getLatestVersions(): Promise<LatestVersions> {
        const err = (name: string) => (err: Error) => {
            console.error('Error getting latest %s version', name, err);
            return undefined;
        };

        const [hapserver, homebridge, hapnodejs, nodejs, nodejs_schedule, npm] = await Promise.all([
            require('..').package_json.private ? undefined :
                this.getLatestNpmPackageVersion(require('..').package_json.name).catch(err('hap-server')),
            require('homebridge/package').private ? undefined :
                this.getLatestNpmPackageVersion('homebridge').catch(err('Homebridge')),
            require('hap-nodejs/package').private ? undefined :
                this.getLatestNpmPackageVersion('hap-nodejs').catch(err('hap-nodejs')),

            this.getLatestNodeJsVersions().catch(err('Node.js')),
            this.getNodeJsScheduledReleases().catch(err('Node.js')),
            this.getLatestNpmPackageVersion('npm').catch(err('npm')),
        ]);

        // Get the supported LTS versions
        const nodejs_lts = !nodejs || !nodejs_schedule ? undefined :
            this.objectFromEntries(Object.entries(nodejs!.lts).filter(([codename, latest_version]) => {
                const lts_release_key = Object.keys(nodejs_schedule!)
                    .find(v => semver.satisfies(latest_version, v));
                if (!lts_release_key) return false;
                const schedule = nodejs_schedule![lts_release_key];

                return schedule.codename &&
                    (new Date(schedule.start)).getTime() < Date.now() &&
                    (new Date(schedule.end)).getTime() > Date.now();
            }));

        return {
            'hap-server': hapserver,
            homebridge,
            'hap-nodejs': hapnodejs,
            nodejs: nodejs?.current,
            nodejs_all: nodejs,
            nodejs_schedule,
            nodejs_lts,
            npm,
        };
    }

    private objectFromEntries<K extends string | number | symbol, V>(entries: [K, V][]) {
        const object = {} as Record<K, V>;

        for (const [key, value] of entries) {
            object[key] = value;
        }

        return object;
    }

    async getLatestNpmPackageVersion(name: string): Promise<string> {
        // eslint-disable-next-line new-cap
        return new Promise<string>((rs, rj) => https.get(NPM_REGISTRY_PACKAGE_URL(name), res => {
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

    async getLatestNodeJsVersions(): Promise<{current: string; lts: Record<string, string>}> {
        return new Promise<{current: string; lts: Record<string, string>}>((rs, rj) => https.get(NODEJS_VERSIONS_URL, res => {
            let data = '';
            res.on('data', chunk => data += chunk.toString('utf-8'));
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) return rj(new Error('Received status code ' + res.statusCode));

                    const releases = JSON.parse(data) as NodeJsRelease[];
                    let current: string | null = null;
                    const lts: Record<string, string> = {};
                    const platform = process.platform === 'darwin' ? 'osx' :
                        process.platform === 'win32' ? 'win' :
                            process.platform;

                    for (const release of releases) {
                        if (!release.files.find(f => f === platform + '-' + process.arch ||
                            f.substr(0, f.lastIndexOf('-')) === platform + '-' + process.arch)) continue;

                        if (!current) {
                            current = semver.coerce(release.version)?.toString() || null;
                        }

                        if (release.lts && !lts[release.lts]) {
                            const v = semver.coerce(release.version)?.toString();
                            if (v) lts[release.lts] = v;
                        }
                    }

                    if (current) return rs({current, lts});

                    rj(new Error('No versions available for the current platform'));
                } catch (err) {
                    rj(err);
                }
            });
        }).on('error', err => {
            rj(err);
        }));
    }

    async getNodeJsScheduledReleases(): Promise<NodeJsScheduledReleases> {
        return new Promise<NodeJsScheduledReleases>((rs, rj) => https.get(NODEJS_RELEASE_SCHEDULE_URL, res => {
            let data = '';
            res.on('data', chunk => data += chunk.toString('utf-8'));
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) return rj(new Error('Received status code ' + res.statusCode));

                    const releases = JSON.parse(data) as NodeJsScheduledReleases;
                    rs(releases);
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
