/// <reference path="./hap-nodejs-types.d.ts" />

declare module 'hap-nodejs/lib/Bridge' {
    import {Accessory} from 'hap-nodejs/lib/Accessory';

    export class Bridge extends Accessory {
        // constructor(displayName: string, serialNumber: string);
        constructor(displayName: string, UUID: string);
    }
}

declare module 'hap-nodejs/lib/AccessoryLoader' {
    import {Accessory} from 'hap-nodejs/lib/Accessory';
    import {Service} from 'hap-nodejs/lib/Service';
    import {Characteristic} from 'hap-nodejs/lib/Characteristic';

    export function loadDirectory(dir: string): Accessory;
    export function parseAccessoryJSON(json: any): Accessory;
    export function parseServiceJSON(json: any): Service;
    export function parseCharacteristicJSON(json: any): Characteristic;
}

declare module 'hap-nodejs/lib/HAPServer' {
    import {
        AccessoryHap, CharacteristicHap,
    } from '@hap-server/types/hap';
    import {TypedEmitter} from 'tiny-typed-emitter';
    import {EventedHTTPServer} from 'hap-nodejs/lib/util/eventedhttp';
    import {AccessoryInfo} from 'hap-nodejs/lib/model/AccessoryInfo';

    interface HapEventData {
        characteristics: {
            aid: number;
            iid: number;
            value: string | number | boolean;
        }[];
    }

    interface GetCharacteristicData {
        aid: number;
        iid: number;
    }

    interface SetCharacteristicData {
        aid: number;
        iid: number;
        value: string | number | boolean;
    }

    type ResourceRequestData = unknown;

    interface Events {
        'listening': (this: HAPServer, port: number) => void;
        'session-close': (this: HAPServer, sessionID: string, events: object) => void;
        'identify': (this: HAPServer, callback: (err?: Error | null) => void) => void;
        'pair': (
            this: HAPServer, clientUsername: string, clientLTPK: Buffer, callback: (err?: Error | null) => void
        ) => void;
        'unpair': (this: HAPServer, clientUsername: string, callback: (err?: Error | null) => void) => void;
        'accessories': (this: HAPServer, callback: {
            (err: Error, accessories?: null): void;
            (err: null, accessories: {accessories: AccessoryHap[]}): void;
        }) => void;
        'get-characteristics': (this: HAPServer, request: GetCharacteristicData[], events: object, callback: {
            (err: Error, characteristics?: null): void;
            (err: null, characteristics: {characteristics: ({
                aid: number;
                iid: number;
                value?: string | number | boolean;
                status?: number;
            } & CharacteristicHap)[];}): void;
        }, remote: boolean, sessionID: string | undefined) => void;
        'set-characteristics': (this: HAPServer, request: SetCharacteristicData[], events: object, callback: {
            (err: Error, characteristics?: null): void;
            (err: null, characteristics: {
                aid: number;
                iid: number;
                status?: number;
            }[]): void;
        }, remote: boolean, sessionID: string | undefined) => void;
        'request-resource': (this: HAPServer, request: ResourceRequestData, callback: {
            (err: Error, resource?: Buffer): void;
            (err: null, resource: Buffer): void;
        }) => void;
    }

    export class HAPServer extends TypedEmitter<Events> {
        static readonly handlers: typeof Handlers;
        static readonly Types: typeof Types;
        static readonly Codes: typeof Codes;
        static readonly Status: typeof Status;

        readonly accessoryInfo: AccessoryInfo;
        allowInsecureRequest: boolean;

        /** Internal server that does all the actual communication */
        readonly _httpServer: EventedHTTPServer;
        readonly _relayServer: unknown;
        private _keepAliveTimerID;

        constructor(accessoryInfo: AccessoryInfo, relayServer?: unknown);

        listen(port: number): void;
        stop(): void;

        private _onKeepAliveTimerTick;

        notifyClients(event: string, data: HapEventData, excludeEvents?: object): void;

        private _onListening;
        private _onRequest;
        private _onRemoteRequest;
        private _onEncrypt;
        private _onDecrypt;
        private _onSessionClose;
        private _handleIdentify;
        private _handlePair;
        private _handlePairStepOne;
        private _handlePairStepTwo;
        private _handlePairStepThree;
        private _handlePairStepFour;
        private _handlePairStepFive;
        private _handlePairVerify;
        private _handlePairVerifyStepOne;
        private _handlePairVerifyStepTwo;
        private _handleRemotePairVerify;
        private _handleRemotePairVerifyStepOne;
        private _handleRemotePairVerifyStepTwo;
        private _handlePairings;
        private _handleAccessories;
        private _handleRemoteAccessories;
        private _handleCharacteristics;
        private _handleResource;
        private _handleRemoteCharacteristicsWrite;
        private _handleRemoteCharacteristicsRead;
    }

    interface HAPServer {
        constructor: typeof HAPServer;
    }

    enum Handlers {
        '/identify' = '_handleIdentify',
        '/pair-setup' = '_handlePair',
        '/pair-verify' = '_handlePairVerify',
        '/pairings' = '_handlePairings',
        '/accessories' = '_handleAccessories',
        '/characteristics' = '_handleCharacteristics',
        '/resource' = '_handleResource',
    }

    enum Types {
        REQUEST_TYPE = 0x00,
        USERNAME = 0x01,
        SALT = 0x02,
        PUBLIC_KEY = 0x03,
        PASSWORD_PROOF = 0x04,
        ENCRYPTED_DATA = 0x05,
        SEQUENCE_NUM = 0x06,
        ERROR_CODE = 0x07,
        PROOF = 0x0a,
    }

    enum Codes {
        INVALID_REQUEST = 0x02,
        INVALID_SIGNATURE = 0x04,
    }

    enum Status {
        SUCCESS = 0,
        INSUFFICIENT_PRIVILEGES = -70401,
        SERVICE_COMMUNICATION_FAILURE = -70402,
        RESOURCE_BUSY = -70403,
        READ_ONLY_CHARACTERISTIC = -70404,
        WRITE_ONLY_CHARACTERISTIC = -70405,
        NOTIFICATION_NOT_SUPPORTED = -70406,
        OUT_OF_RESOURCE = -70407,
        OPERATION_TIMED_OUT = -70408,
        RESOURCE_DOES_NOT_EXIST = -70409,
        INVALID_VALUE_IN_REQUEST = -70410,
    }
}

declare module 'hap-nodejs/lib/util/eventedhttp' {
    import {TypedEmitter} from 'tiny-typed-emitter';

    interface Events {
        'listening': (this: EventedHTTPServer, port: number) => void;
        'request': (
            this: EventedHTTPServer, req: import('http').IncomingMessage, res: import('http').ServerResponse,
            session: Session, events: object
        ) => void;
        'encrypt': (
            this: EventedHTTPServer, toEncrypt: Buffer, result: {data: Buffer | null}, session: Session
        ) => void;
        'decrypt': (
            this: EventedHTTPServer, toDecrypt: Buffer, result: {data: Buffer | null}, session: Session
        ) => void;
        'session-close': (this: EventedHTTPServer, sessionID: string, events: object) => void;
    }

    export class EventedHTTPServer extends TypedEmitter<Events> {
        readonly _tcpServer: import('net').Server;
        readonly _connections: EventedHTTPServerConnection[];

        constructor();

        listen(port: number): void;
        stop(): void;
        sendEvent(event: string, data: string, contentType: string, exclude: object): void;

        private _onConnection;
        private _handleConnectionClose;
    }

    interface EventedHTTPServer {
        constructor: typeof EventedHTTPServer;
    }

    interface Session {
        sessionID: string;
        encryption?: Encryption;
    }

    class Encryption {
        clientPublicKey: Buffer;
        secretKey: Buffer;
        publicKey: Buffer;
        sharedSec: Buffer;
        hkdfPairEncKey: Buffer;
        accessoryToControllerCount: {
            value: number;
        };
        controllerToAccessoryCount: {
            value: number;
        };
        accessoryToControllerKey: Buffer;
        controllerToAccessoryKey: Buffer;
        extraInfo: unknown;
    }

    interface ConnectionEvents {
        'request': (
            this: EventedHTTPServerConnection, req: import('http').IncomingMessage, res: import('http').ServerResponse,
            session: Session, events: object
        ) => void;
        'encrypt': (
            this: EventedHTTPServerConnection, toEncrypt: Buffer, result: {data: Buffer | null}, session: Session
        ) => void;
        'decrypt': (
            this: EventedHTTPServerConnection, toDecrypt: Buffer, result: {data: Buffer | null}, session: Session
        ) => void;
        'close': (this: EventedHTTPServerConnection, events: object) => void;
    }

    class EventedHTTPServerConnection extends TypedEmitter<ConnectionEvents> {
        readonly sessionID: string;

        /** Cache because it becomes undefined in 'onClientSocketClose' */
        readonly _remoteAddress: string;
        /** Data received from client before HTTP proxy is fully setup */
        readonly _pendingClientSocketData: Buffer;
        /** true when we are finished establishing connections */
        readonly _fullySetup: boolean;
        /** true while we are composing an HTTP response (so events can wait) */
        readonly _writingResponse: boolean;
        /** Event data waiting to be sent until after an in-progress HTTP response is being written */
        readonly _pendingEventData: Buffer;

        /** clientSocket is the socket connected to the actual iOS device */
        readonly _clientSocket: import('net').Socket;

        /** serverSocket is our connection to our own internal httpServer, created after httpServer 'listening' event */
        readonly _serverSocket: import('net').Socket | null;

        /** Our internal HTTP server for this connection that we will proxy data to and from */
        readonly _httpServer: import('http').Server;

        /** An arbitrary dict that users of this class can store values in to associate with this particular connection */
        readonly _session: Session;

        /** A collection of event names subscribed to by this connection */
        readonly _events: {
            // this._events[eventName] = true (value is arbitrary, but must be truthy)
            [eventName: string]: true | undefined;
        };

        constructor(clientSocket: import('net').Socket);

        sendEvent(event: string, data: string, contentType: string, excludeEvents: object): void;

        private _sendPendingEvents;
        private _onHttpServerListening;
        private _onServerSocketConnect;
        private _onClientSocketData;
        private _onServerSocketData;
        private _onServerSocketClose;
        private _onServerSocketError;
        private _onHttpServerRequest;
        private _onHttpServerClose;
        private _onHttpServerError;
        private _onClientSocketClose;
        private _onClientSocketError;
    }

    interface EventedHTTPServerConnection {
        constructor: typeof EventedHTTPServerConnection;
    }
}

declare module 'hap-nodejs/lib/Advertiser' {
    import {AccessoryInfo} from 'hap-nodejs/lib/model/AccessoryInfo';

    export class Advertiser {
        accessoryInfo: AccessoryInfo;
        _bonjourService: unknown;
        _advertisement: import('bonjour').Service | null;
        _setupHash: string;

        constructor(accessoryInfo: AccessoryInfo, mdnsConfig?: unknown);

        startAdvertising(port: number): void;
        isAdvertising(): boolean;
        updateAdvertisement(): void;
        stopAdvertising(): void;
        private _computeSetupHash;
    }

    interface Advertiser {
        constructor: typeof Advertiser;
    }
}

declare module 'hap-nodejs/lib/Camera' {
    import {Service} from 'hap-nodejs/lib/Service';
    import {StreamController} from 'hap-nodejs/lib/StreamController';

    export interface SessionInfo {
        address: string;
        video_port?: number;
        video_srtp?: Buffer;
        video_ssrc?: number;
        audio_port?: number;
        audio_srtp?: Buffer;
        audio_ssrc?: number;
    }

    interface SnapshotRequest {
        width: number;
        height: number;
    }
    type SnapshotCallback = {
        (err: Error | null, snapshot?: null): void;
        (err: null, snapshot: Buffer): void;
    };

    interface PrepareStreamRequest {
        sessionID: string;
        targetAddress: string;
        video?: {
            port: number;
            srtp_key: Buffer;
            srtp_salt: Buffer;
        };
        audio?: {
            port: number;
            srtp_key: Buffer;
            srtp_salt: Buffer;
        };
    }
    interface PrepareStreamResponse {
        video?: {
            port: number;
            ssrc: number;
            srtp_key: Buffer;
            srtp_salt: Buffer;
        };
        audio?: {
            port: number;
            ssrc: number;
            srtp_key: Buffer;
            srtp_salt: Buffer;
        };
        address: {
            address: string;
            type: 'v4' | 'v6';
        };
    }
    type PrepareStreamCallback = (response: PrepareStreamResponse) => void;

    interface StreamRequest {
        sessionID: string;
        type: 'start' | 'stop';
        video?: {
            width: number;
            height: number;
            fps: number;
            max_bit_rate: number;
        };
    }

    export class Camera {
        readonly services: Service[];
        readonly streamControllers: StreamController[];

        readonly pendingSessions: {
            [sessionID: string]: SessionInfo | undefined;
        };
        readonly ongoingSessions: {
            [sessionID: string]: import('child_process').ChildProcess | undefined;
        };

        constructor();

        handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotCallback): void;
        handleCloseConnection(connectionID: string): void;
        prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): void;
        handleStreamRequest(request: StreamRequest): void;
        createCameraControlService(): void;
        private _createStreamControllers;
    }

    interface Camera {
        constructor: typeof Camera;
    }
}

declare module 'hap-nodejs/lib/StreamController' {
    export const StreamController: unknown;
    export type StreamController = unknown;
}

declare module 'hap-nodejs/lib/Accessory' {
    import {TypedEmitter} from 'tiny-typed-emitter';
    import {Service} from 'hap-nodejs/lib/Service';
    import {ToHapOptions} from 'hap-nodejs/lib/Characteristic';
    import {Camera} from 'hap-nodejs/lib/Camera';
    import {HAPServer} from 'hap-nodejs/lib/HAPServer';
    import {Advertiser} from 'hap-nodejs/lib/Advertiser';
    import {AccessoryInfo} from 'hap-nodejs/lib/model/AccessoryInfo';
    import {IdentifierCache} from 'hap-nodejs/lib/model/IdentifierCache';

    interface Events {
        'identify': (this: Accessory, paired: boolean, callback: (err?: Error) => void) => void;
        'service-configurationChange': (this: Accessory, change: {accessory: Accessory; service: Service}) => void;
        'service-characteristic-change': (this: Accessory, change: never & {service: Service}) => void;
        'listening': (this: Accessory, port: number) => void;
    }

    interface PublishInfo {
        username: string;
        pincode: string;
        category?: Category;
        setupID?: string;
        port?: number;
        mdns?: unknown;
    }

    export class Accessory extends TypedEmitter<Events> {
        static readonly Categories: typeof Category;

        readonly displayName: string;
        readonly UUID: string;
        readonly aid: null; // assigned by us in assignIDs() or by a Bridge
        /** true if we are a Bridge (creating a new instance of the Bridge subclass sets this to true) */
        readonly _isBridge: boolean;
        /** true if we are hosted "behind" a Bridge Accessory */
        readonly bridged: boolean;
        /** If we are a Bridge, these are the Accessories we are bridging. */
        readonly bridgedAccessories: Accessory[];
        reachable: boolean;
        category: Category;
        readonly services: Service[];
        readonly cameraSource: Camera | null;
        /** Purge unused ids by default */
        readonly shouldPurgeUnusedIDs: boolean;

        private _setupID;
        private _setupURI;

        constructor(displayName: string, UUID: string);
        private _identificationRequest;

        addService<S extends Service, A extends any[]>(service: S | {new (...args: A): S}, ...args: A): S;
        setPrimaryService(service: Service): void;
        removeService(service: Service): void;
        getService<S extends Service>(service: {new (): S; UUID?: string}): S;
        getService<S extends Service>(service: {new (): S; UUID?: string} | string): S | undefined;

        /** @deprecated */
        updateReachability(reachable: boolean): void;

        addBridgedAccessory<A extends Accessory>(accessory: A, deferUpdate?: boolean): A;
        addBridgedAccessories(accessories: Accessory[]): void;
        removeBridgedAccessory(accessory: Accessory, deferUpdate?: boolean): void;
        removeBridgedAccessories(accessories: Accessory[]): void;
        removeAllBridgedAccessories(): void;

        private getCharacteristicByIID;
        private getBridgedAccessoryByAID;
        private findCharacteristic;

        configureCameraSource(cameraSource: Camera): void;
        setupURI(): string;

        private _assignIDs;
        disableUnusedIDPurge(): void;
        enableUnusedIDPurge(): void;
        purgeUnusedIDs(): void;
        toHAP(opt?: ToHapOptions): unknown;

        _accessoryInfo?: AccessoryInfo;
        _identifierCache?: IdentifierCache;
        _advertiser?: Advertiser;
        _server?: HAPServer;

        publish(info: PublishInfo /* , allowInsecureRequest?: boolean */): void;
        destroy(): void;
        unpublish(): void;

        private _updateConfiguration;
        private _onListening;
        private _handleIdentify;
        private _handlePair;
        private _handleUnpair;
        private _handleAccessories;
        private _handleGetCharacteristics;
        private _handleSetCharacteristics;
        private _handleResource;
        private _handleSessionClose;
        private _unsubscribeEvents;
        private _handleCharacteristicChange;
        private _setupService;
        private _sideloadServices;
        private _generateSetupID;
    }

    export interface Accessory {
        constructor: typeof Accessory;
    }

    export namespace Accessory {
        type Categories = Category;
    }

    export const enum Category {
        OTHER = 1,
        BRIDGE = 2,
        FAN = 3,
        GARAGE_DOOR_OPENER = 4,
        LIGHTBULB = 5,
        DOOR_LOCK = 6,
        OUTLET = 7,
        SWITCH = 8,
        THERMOSTAT = 9,
        SENSOR = 10,
        /** @deprecated */
        ALARM_SYSTEM = 11,
        SECURITY_SYSTEM = 11,
        DOOR = 12,
        WINDOW = 13,
        WINDOW_COVERING = 14,
        PROGRAMMABLE_SWITCH = 15,
        RANGE_EXTENDER = 16,
        /** @deprecated */
        CAMERA = 17,
        IP_CAMERA = 17,
        VIDEO_DOORBELL = 18,
        AIR_PURIFIER = 19,
        /** Not in HAP specification */
        AIR_HEATER = 20,
        /** Not in HAP specification */
        AIR_CONDITIONER = 21,
        /** Not in HAP specification */
        AIR_HUMIDIFIER = 22,
        /** Not in HAP specification */
        AIR_DEHUMIDIFIER = 23,
        APPLE_TV = 24,
        SPEAKER = 26,
        AIRPORT = 27,
        SPRINKLER = 28,
        FAUCET = 29,
        SHOWER_HEAD = 30,
        TELEVISION = 31,
        /** Remote Control */
        TARGET_CONTROLLER = 32,
    }
}

declare module 'hap-nodejs/lib/Service' {
    import {TypedEmitter} from 'tiny-typed-emitter';
    import {Characteristic, ToHapOptions, CharacteristicGetContext} from 'hap-nodejs/lib/Characteristic';

    interface Events<T = string | number | boolean> {
        'characteristic-change': (this: Service, change: {
            oldValue: T | null;
            newValue: T;
            context: CharacteristicGetContext;
            characteristic: Characteristic<T>;
        }) => void;
        'service-configurationChange': (this: Service, change: {service: Service}) => void;
    }

    export class Service extends TypedEmitter<Events> {
        readonly displayName: string | undefined;
        readonly UUID: string;
        readonly subtype: string | undefined;
        /** Assigned later by our containing Accessory */
        readonly iid: string;
        readonly characteristics: Characteristic[];
        readonly optionalCharacteristics: Characteristic[];

        /** Assigned later by our containing Accessory */
        readonly isHiddenService: boolean;
        /** Assigned later by our containing Accessory */
        readonly isPrimaryService: boolean;
        readonly linkedServices: Service[];

        constructor(displayName: string | undefined, UUID: string, subtype?: string);
        addCharacteristic<C extends Characteristic, A extends any[]>(
            characteristic: C | {new (...args: A): C}, ...args: A): C;
        setHiddenService(isHidden: boolean): void;
        addLinkedService(newLinkedService: Service): void;
        removeLinkedService(oldLinkedService: Service): void;
        removeCharacteristic(characteristic: Characteristic): void;
        getCharacteristic<C extends Characteristic>(characteristic: {new (): C; UUID?: string}): C;
        getCharacteristic<C extends Characteristic>(characteristic: {new (): C; UUID?: string} | string): C | undefined;
        testCharacteristic<C extends {new (): Characteristic}>(characteristic: (C & {UUID?: string}) | string): boolean;
        setCharacteristic<C extends {new (): Characteristic<T>}, T = string | number | boolean>(
            characteristic: (C & {UUID?: string}) | string, value: T): this;
        updateCharacteristic<C extends {new (): Characteristic<T>}, T = string | number | boolean>(
            characteristic: (C & {UUID?: string}) | string, value: T): this;
        addOptionalCharacteristic(characteristic: Characteristic | {new (): Characteristic}): void;
        private getCharacteristicByIID;
        private _assignIDs;
        toHAP(opt?: ToHapOptions): unknown;
        private _setupCharacteristic;
        private _sideloadCharacteristics;
    }

    interface Service {
        constructor: typeof Service;
    }

    class PS extends Service {
        static readonly UUID: string;

        constructor(displayName?: string, subtype?: string);
    }

    export type PredefinedService = typeof PS;
}

declare module 'hap-nodejs/lib/Characteristic' {
    import {TypedEmitter} from 'tiny-typed-emitter';
    import {
        CharacteristicFormat, CharacteristicUnit, CharacteristicPerms,
    } from '@hap-server/types/hap';

    type CharacteristicGetCallback<T> = (err: Error | null, value?: T | null) => void;
    type CharacteristicGetContext = object;
    type CharacteristicSetCallback = (err?: Error) => void;
    type CharacteristicSetContext = object;
    type CharacteristicUpdateCallback = () => void;
    type CharacteristicUpdateContext = object;

    interface Events<T = string | number | boolean> {
        'subscribe': (this: Characteristic<T>) => void;
        'unsubscribe': (this: Characteristic<T>) => void;
        'get': (this: Characteristic<T>, callback: {
            (err: Error): void;
            (err: null, newValue: T): void;
        }, context?: CharacteristicGetContext, connectionID?: string) => void;
        'set': (
            this: Characteristic<T>, value: T, callback: (err?: Error) => void,
            context?: CharacteristicGetContext, connectionID?: string
        ) => void;
        'change': (this: Characteristic<T>, change: {
            oldValue: T | null; newValue: T; context: CharacteristicGetContext
        }) => void;
    }

    export interface CharacteristicProps {
        format: CharacteristicFormat;
        unit?: CharacteristicUnit;
        minValue?: number;
        maxValue?: number;
        minStep?: number;
        validValues?: number[];
        validValuesRange?: [number, number];
        perms: CharacteristicPerms[];
    }

    export interface ToHapOptions {
        omitValues?: boolean;
    }

    export class Characteristic<T = string | number | boolean> extends TypedEmitter<Events<T>> {
        static readonly Formats: typeof CharacteristicFormat;
        static readonly Units: typeof CharacteristicUnit;
        static readonly Perms: typeof CharacteristicPerms;

        readonly displayName: string;
        readonly UUID: string;
        readonly iid: number | null; // assigned by our containing Service
        readonly value: T | null;
        readonly status: number | null;
        readonly eventOnlyCharacteristic: boolean;
        readonly props: CharacteristicProps;

        readonly subscriptions: number;

        constructor(displayName: string, UUID: string, props?: CharacteristicProps);

        setProps(props: Partial<CharacteristicProps>): this;
        subscribe(): void;
        unsubscribe(): void;
        getValue(
            callback?: CharacteristicGetCallback<T>, context?: CharacteristicGetContext, connectionID?: string): void;
        /** Cooerces into a valid value */
        validateValue(newValue: T): T;
        setValue(
            newValue: T | Error, callback?: CharacteristicSetCallback, context?: CharacteristicSetContext,
            connectionID?: string
        ): this;
        updateValue(
            newValue: T | Error, callback?: CharacteristicUpdateCallback, context?: CharacteristicUpdateContext): this;
        getDefaultValue(): false | '' | object | any[] | number | null;
        private _assignID;
        toHAP(opt?: ToHapOptions): unknown;
    }

    export interface Characteristic {
        constructor: typeof Characteristic;
    }

    class PC<T> extends Characteristic<T> {
        static readonly UUID: string;

        constructor(props?: CharacteristicProps);
    }

    type PredefinedCharacteristicConstructor<T, C> = typeof PC & {new (...args: any): PredefinedCharacteristic<T, C>};
    export type PredefinedCharacteristic<T = string | number | boolean, C = {}> =
        PredefinedCharacteristicConstructor<T, C> & C;
}

declare module 'hap-nodejs/lib/model/AccessoryInfo' {
    import {Category} from 'hap-nodejs/lib/Accessory';

    export class AccessoryInfo {
        readonly username: string;
        displayName: string;
        category: Category;
        pincode: string;
        readonly signSk: Buffer;
        readonly signPk: Buffer;
        readonly pairedClients: {
            /** pairedClients[clientUsername:string] = clientPublicKey:Buffer */
            [clientUsername: string]: Buffer | undefined;
        };
        configVersion: number;
        configHash: string;

        setupID: string;

        readonly relayEnabled: boolean;
        readonly relayState: number;
        readonly relayAccessoryID: string;
        readonly relayAdminID: string;
        readonly relayPairedControllers: {
            [username: string]: string | undefined;
        };
        readonly accessoryBagURL: string;

        private constructor(username: string);

        addPairedClient(username: string, publicKey: Buffer): void;
        removePairedClient(username: string): void;
        getClientPublicKey(username: string): Buffer | undefined;
        paired(): boolean;
        updateRelayEnableState(state: boolean): void;
        updateRelayState(newState: number): void;
        addPairedRelayClient(username: string, accessToken: string): void;
        removePairedRelayClient(username: string): void;

        static persistKey(username: string): string;
        static create(username: string): AccessoryInfo;
        static load(username: string): AccessoryInfo | null;
        save(): void;
        remove(): void;
    }

    interface AccessoryInfo {
        constructor: typeof AccessoryInfo;
    }
}

declare module 'hap-nodejs/lib/model/IdentifierCache' {
    export class IdentifierCache {
        username: string;
        _cache: {
            [key: string]: number | undefined;
        };
        _usedCache: {
            [key: string]: number | undefined;
        } | null;
        _savedCacheHash: string;

        constructor(username: string);

        startTrackingUsage(): void;
        stopTrackingUsageAndExpireUnused(): void;

        getCache(key: string): number | undefined;
        setCache(key: string, value: number): number;

        getAID(accessoryUUID: string): number;
        getIID(
            accessoryUUID: string, serviceUUID: string, serviceSubtype?: string, characteristicUUID?: string): number;
        getNextAID(): number;
        getNextIID(accessoryUUID: string): number;

        static persistKey(username: string): string;
        static load(username: string): IdentifierCache | null;
        save(): void;
        remove(): void;
    }

    interface IdentifierCache {
        constructor: typeof IdentifierCache;
    }
}

declare module 'hap-nodejs/lib/gen/HomeKitTypes';

declare module 'hap-nodejs/lib/util/clone' {
    export function clone<A, B>(a: A, b: B): A & B;
}

declare module 'hap-nodejs/lib/util/once' {
    export function once<A extends any[], R>(func: (...args: A) => R): (...args: A) => R;
}

declare module 'hap-nodejs/lib/util/uuid' {
    type BinaryLike = string | Buffer | NodeJS.TypedArray | DataView;

    export function generate(data: BinaryLike): string;
    export function isValid(UUID: string): boolean;
    export function unparse(buf: Buffer, offset?: number): string;

    export {};
}

declare module 'hap-nodejs/lib/util/tlv' {
    export function encode(type: number, data: Buffer | number | string, ...args: (number | Buffer | string)[]): void;
    export function decode(data: Buffer): Record<number, Buffer>;
}

declare module 'hap-nodejs/lib/util/encryption' {
    import nacl = require('tweetnacl');

    interface Counter {
        value: number;
    }

    interface ExtraInfo {
        leftoverData?: Buffer;
    }

    export function generateCurve25519KeyPair(): nacl.BoxKeyPair;
    export function generateCurve25519SharedSecKey(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array;

    export function layerEncrypt(data: Buffer, count: Counter, key: Buffer): Buffer;
    export function layerDecrypt(data: Buffer, count: Counter, key: Buffer, extraInfo: ExtraInfo): void;

    export function verifyAndDecrypt(
        key: Buffer, nonce: Buffer, ciphertext: Buffer, mac: Buffer, additional_data: Buffer | null,
        plaintext: Buffer
    ): boolean;
    export function encryptAndSeal(
        key: Buffer, nonce: Buffer, plaintext: Buffer, additional_data: Buffer | null, ciphertext: Buffer,
        mac: Buffer
    ): void;
}

declare module 'hap-nodejs/lib/util/hkdf' {
    type BinaryLike = string | Buffer | NodeJS.TypedArray | DataView;

    export function HKDF(hashAlg: string, salt: BinaryLike, ikm: BinaryLike, info: Buffer, size: number): Buffer;

    export {};
}
