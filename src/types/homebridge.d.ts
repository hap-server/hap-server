/// <reference path="./hap-nodejs.d.ts" />

declare module 'homebridge/lib/server' {
    import {API} from 'homebridge/lib/api';
    import {Plugin} from 'homebridge/lib/plugin';
    import {PlatformAccessory} from 'homebridge/lib/platformAccessory';
    import {Accessory, Bridge, Service} from '@hap-server/types/hap-nodejs';

    interface HomebridgeOptions {
        config?: unknown;
        cleanCachedAccessories?: boolean;
        hideQRCode?: boolean;
        insecureAccess?: boolean;
    }

    type Platform = unknown;

    export class Server {
        readonly _api: API;
        readonly _config: unknown;
        readonly _plugins: Record</** Plugin name */ string, /** Plugin instance */ Plugin>;
        readonly _cachedPlatformAccessories: PlatformAccessory[];
        readonly _bridge: Bridge;
        readonly _cleanCachedAccessories: boolean;
        readonly _hideQRCode: boolean;

        readonly _externalPorts: {
            start: number;
            end: number;
        } | undefined;
        readonly _nextExternalPort: number | undefined;

        readonly _activeDynamicPlugins: Record<string, Platform | undefined>;
        readonly _configurablePlatformPlugins: Record<string, Platform | undefined>;
        readonly _publishedAccessories: Record<string, PlatformAccessory | undefined>;
        readonly _setupManager: unknown;

        readonly _allowInsecureAccess: boolean;

        constructor(opts?: HomebridgeOptions);

        run(): void;
        _publish(): void;
        private _loadPlugins;
        private _loadConfig;
        private _loadCachedPlatformAccessories;
        _computeActivePluginList(): Record<string, true | undefined>;
        _createBridge(): Bridge;
        private _loadAccessories;
        private _loadPlatforms;
        private _loadDynamicPlatforms;
        private _configCachedPlatformAccessories;
        private _loadPlatformAccessories;
        private _createAccessory;
        private _handleRegisterPlatformAccessories;
        private _handleUpdatePlatformAccessories;
        private _handleUnregisterPlatformAccessories;
        private _handlePublishExternalAccessories;
        private _updateCachedAccessories;
        _teardown(): void;
        private _handleNewConfig;
        _printPin(pin: string): void;
        _printSetupInfo(): void;
    }
}

declare module 'homebridge/lib/api' {
    import {User} from 'homebridge/lib/user';
    import {PlatformAccessory} from 'homebridge/lib/platformAccessory';
    import {CallableLogger} from 'homebridge/lib/logger';
    import {Service} from 'hap-nodejs/lib/Service';
    import {TypedEmitter} from 'tiny-typed-emitter';

    type AccessoryConstructor = {
        new (log: CallableLogger, config: any): AccessoryInstance;
    };
    interface AccessoryInstance {
        getServices(): Service[];
        identify?(callback: (err?: Error) => void): void;
    }
    type ConfigurationRequestHandler = unknown;
    type PlatformConstructor = {
        new (log: CallableLogger, config: any, homebridge: API): PlatformInstance;
    };
    interface PlatformInstance {
        accessories(callback: (accessories: AccessoryInstance[]) => void): void;
        configurationRequestHandler?: unknown;
    }
    type DynamicPlatformConstructor = {
        new (log: CallableLogger, config: any, homebridge: API): DynamicPlatformInstance;
    };
    interface DynamicPlatformInstance {
        configureAccessory(accessory: PlatformAccessory): void;
        configurationRequestHandler?: unknown;
    }

    interface Events {
        'publishExternalAccessories': (this: API, accessories: PlatformAccessory[]) => void;
        'registerPlatformAccessories': (this: API, accessories: PlatformAccessory[]) => void;
        'updatePlatformAccessories': (this: API, accessories: PlatformAccessory[]) => void;
        'unregisterPlatformAccessories': (this: API, accessories: PlatformAccessory[]) => void;
    }

    export class API extends TypedEmitter<Events> {
        readonly _accessories: Record<string, AccessoryConstructor | undefined>;
        readonly _platforms: Record<string, PlatformConstructor | undefined>;

        readonly _configurableAccessories: Record<any, ConfigurationRequestHandler | undefined>;
        readonly _dynamicPlatforms: Record<string, PlatformConstructor | undefined>;

        readonly version: number;
        readonly serverVersion: string;

        readonly user: typeof User;
        readonly hap: typeof import('@hap-server/types/hap-nodejs');
        readonly hapLegacyTypes: unknown;
        readonly platformAccessory: typeof PlatformAccessory;

        constructor();

        accessory(name: string): AccessoryConstructor;
        registerAccessory(
            pluginName: string, accessoryName: string, constructor: AccessoryConstructor,
            configurationRequestHandler?: ConfigurationRequestHandler
        ): void;
        publishCameraAccessories(pluginName: string, accessories: PlatformAccessory[]): void;
        publishExternalAccessories(pluginName: string, accessories: PlatformAccessory[]): void;
        platform(name: string): PlatformConstructor;
        registerPlatform(
            pluginName: string, platformName: string, constructor: DynamicPlatformConstructor, dynamic: true
        ): void;
        registerPlatform(
            pluginName: string, platformName: string, constructor: PlatformConstructor, dynamic?: false
        ): void;
        registerPlatformAccessories(pluginName: string, platformName: string, accessories: PlatformAccessory[]): void;
        updatePlatformAccessories(accessories: PlatformAccessory[]): void;
        unregisterPlatformAccessories(pluginName: string, platformName: string, accessories: PlatformAccessory[]): void;
    }
}

declare module 'homebridge/lib/platformAccessory' {
    import {Accessory, Category} from 'hap-nodejs/lib/Accessory';
    import {Service} from 'hap-nodejs/lib/Service';
    import {Camera} from 'hap-nodejs/lib/Camera';

    export class PlatformAccessory {
        readonly displayName: string;
        readonly UUID: string;
        readonly category: Category;
        readonly services: Service[];
        readonly reachable: boolean;
        readonly context: Record<any, any>;

        readonly _associatedPlugin: string | undefined;
        readonly _associatedPlatform: string | undefined;
        readonly _associatedHAPAccessory: Accessory | undefined;

        constructor(displayName: string, UUID: string, category?: Category);

        addService<S extends Service, A extends any[]>(service: S | {new (...args: A): S}, ...args: A): S;
        removeService(service: Service): void;
        getService(name: string | {new (...args: any): Service; UUID: string}): Service | undefined;
        getServiceByUUIDAndSubType(UUID: string | {new (...args: any): Service; UUID: string}, subtype: string): void;
        /** @deprecated */
        updateReachability(reachable: boolean): void;
        configureCameraSource(cameraSource: Camera): void;
        private _prepareAssociatedHAPAccessory;
        private _dictionaryPresentation;
        private _configFromData;
    }
}

declare module 'homebridge/lib/plugin' {
    import {API} from 'homebridge/lib/api';
    import {Logger} from 'homebridge/lib/logger';

    export class Plugin {
        static paths: string[];

        readonly pluginPath: string;
        readonly initializer: ((api: API, log: Logger) => void) | undefined;

        constructor(pluginPath: string);

        name(): string;
        load(options?: object): void;

        static loadPackageJSON(pluginPath: string): any;
        static getDefaultPaths(): string[];
        static addPluginPath(pluginPath: string): void;
        static installed(): Plugin[];
    }
}

declare module 'homebridge/lib/user' {
    export class User {
        static config(): unknown;
        static storagePath(): string;
        static configPath(): string;
        static persistPath(): string;
        static cachedAccessoryPath(): string;
        static setStoragePath(storagePath: string): void;
    }
}

declare module 'homebridge/lib/logger' {
    export class Logger {
        prefix: string | undefined;

        constructor(prefix?: string);

        debug(msg: string, ...args: any[]): void;
        info(msg: string, ...args: any[]): void;
        warn(msg: string, ...args: any[]): void;
        error(msg: string, ...args: any[]): void;

        log(level: 'debug' | 'warn' | 'error' | 'info', msg: string, ...args: any[]): void;

        static withPrefix(prefix: string): CallableLogger;
    }

    export type CallableLogger = Logger & {
        (msg: string, ...args: any[]): void;
    };

    export function setDebugEnabled(debugEnabled: boolean): void;
    export function setTimestampEnabled(timestampEnabled: boolean): void;
    export function forceColor(): void;
    export const _system: Logger;
}
