declare module 'hap-controller' {
    import HttpClient = require('hap-controller/lib/transport/ip/http-client');
    import IPDiscovery = require('hap-controller/lib/transport/ip/ip-discovery');

    export {
        HttpClient,
        IPDiscovery,
    };

    export const BLEDiscovery: any;
    export type BLEDiscovery = any;
}

declare module 'hap-controller/lib/protocol/pairing-protocol' {
    interface PairingData {
        /** Hex encoded 17 byte accessory pairing identifier */
        AccessoryPairingID: string;
        /** Hex encoded 32 byte accessory public key */
        AccessoryLTPK: string;
        /** Hex encoded 36 byte controller pairing identifier */
        iOSDevicePairingID: string;
        /** Hex encoded 64 byte controller private key */
        iOSDeviceLTSK: string;
        /** Hex encoded 32 byte controller public key */
        iOSDeviceLTPK: string;
    }

    interface SessionKeys {
        AccessoryToControllerKey: Buffer;
        ControllerToAccessoryKey: Buffer;
    }

    enum Steps {
        M1 = 1,
        M2 = 2,
        M3 = 3,
        M4 = 4,
        M5 = 5,
        M6 = 6,
    }

    enum Methods {
        PairSetup = 1,
        PairVerify = 2,
        AddPairing = 3,
        RemovePairing = 4,
        ListPairings = 5,
        PairResume = 6,
    }

    enum Types {
        kTLVType_Method = 0,
        kTLVType_Identifier = 1,
        kTLVType_Salt = 2,
        kTLVType_PublicKey = 3,
        kTLVType_Proof = 4,
        kTLVType_EncryptedData = 5,
        kTLVType_State = 6,
        kTLVType_Error = 7,
        kTLVType_RetryDelay = 8,
        kTLVType_Certificate = 9,
        kTLVType_Signature = 10,
        kTLVType_Permissions = 11,
        kTLVType_FragmentData = 12,
        kTLVType_FragmentLast = 13,
        kTLVType_SessionID = 14,
        kTLVType_Separator = 255,
    }

    enum Errors {
        kTLVError_Unknown = 1,
        kTLVError_Authentication = 2,
        kTLVError_Backoff = 3,
        kTLVError_MaxPeers = 4,
        kTLVError_MaxTries = 5,
        kTLVError_Unavailable = 6,
        kTLVError_Busy = 7,
    }

    class PairingProtocol {
        AccessoryPairingID: Buffer | null;
        AccessoryLTPK: Buffer | null;
        iOSDevicePairingID: Buffer | null;
        iOSDeviceLTSK: Buffer | null;
        iOSDeviceLTPK: Buffer | null;

        srpClient: unknown;
        pairSetup: {
            sessionKey: unknown;
        };
        pairVerify: {
            privateKey: unknown;
            publicKey: unknown;
            sessionKey: unknown;
            sharedSecret: unknown;
            accessoryPublicKey: unknown;
            sessionID: unknown;
        };
        sessionKeys: {
            accessoryToControllerKey: Buffer | null;
            controllerToAccessoryKey: Buffer | null;
        };

        constructor(pairingData?: PairingData);

        static bufferFromHex(buffer: Buffer | string): Buffer;
        static bufferToHex(buffer: Buffer | string): string;

        canResume(): boolean;

        buildPairSetupM1(): Promise<Buffer>;
        parsePairSetupM2(m2Buffer: Buffer): Promise<unknown>;
        buildPairSetupM3(m2Tlv: unknown, pin: string): Promise<Buffer>;
        parsePairSetupM4(m4Buffer: Buffer): Promise<unknown>;
        buildPairSetupM5(): Promise<Buffer>;
        parsePairSetupM6(m6Buffer: Buffer): Promise<unknown>;

        buildPairVerifyM1(): Promise<Buffer>;
        parsePairVerifyM2(m2Buffer: Buffer): Promise<unknown>;
        buildPairVerifyM3(): Promise<Buffer>;
        parsePairVerifyM4(m4Buffer: Buffer): Promise<unknown>;

        getSessionKeys(): Promise<SessionKeys>;

        buildAddPairingM1(identifier: string, ltpk: Buffer, isAdmin: boolean): Promise<Buffer>;
        parseAddPairingM2(m2Buffer: Buffer): Promise<unknown>;

        buildRemovePairingM1(identifier: string): Promise<Buffer>;
        parseRemovePairingM2(m2Buffer: Buffer): Promise<unknown>;

        buildListPairingsM1(): Promise<Buffer>;
        parseListPairingsM2(m2Buffer: Buffer): Promise<unknown>;

        buildPairResumeM1(): Promise<Buffer>;
        parsePairResumeM2(m2Buffer: Buffer): Promise<unknown>;

        getLongTermData(): PairingData;
    }

    namespace PairingProtocol {
        export {
            PairingData,
            SessionKeys,
        };
    }

    export = PairingProtocol;
}

declare module 'hap-controller/lib/transport/ip/http-client' {
    import {EventEmitter} from 'events';

    import {AccessoryHap} from '@hap-server/types/hap';
    import HttpConnection = require('hap-controller/lib/transport/ip/http-connection');
    import PairingProtocol = require('hap-controller/lib/protocol/pairing-protocol');

    interface AccessoriesHap {
        accessories: AccessoryHap[];
    }

    interface GetCharacteristicsOptions {
        meta?: boolean;
        perms?: boolean;
        type?: boolean;
        ev?: boolean;
    }

    interface CharacteristicValueHap {
        aid: number;
        iid: number;
        value: any;
    }

    interface CharacteristicsHap {
        characteristics: CharacteristicValueHap[];
    }

    class HttpClient extends EventEmitter {
        deviceId: string;
        address: string;
        port: number;
        pairingProtocol: PairingProtocol;

        constructor(deviceId: string, address: string, port: number, pairingData?: PairingProtocol.PairingData);
        getLongTermData(): PairingProtocol.PairingData;

        identify(): Promise<void>;

        pairSetup(pin: string): Promise<void>;
        protected _pairVerify(connection: any): Promise<PairingProtocol.SessionKeys>;

        removePairing(identifier: string): Promise<void>;
        addPairing(identifier: string, ltpk: Buffer, isAdmin: boolean): Promise<void>;
        listPairings(): Promise<unknown>;

        getAccessories(): Promise<AccessoriesHap>;
        getCharacteristics(characteristics: string[], options?: GetCharacteristicsOptions): Promise<CharacteristicsHap>;
        setCharacteristics(characteristics: {[aidiid: string]: any}): Promise<any>;
        subscribeCharacteristics(characteristics: string[]): Promise<HttpConnection>;
        unsubscribeCharacteristics(characteristics: string[], connection: HttpConnection): Promise<void>;
    }

    export = HttpClient;
}

declare module 'hap-controller/lib/transport/ip/http-connection' {
    import {EventEmitter} from 'events';
    import * as net from 'net';

    import {SessionKeys} from 'hap-controller/lib/protocol/pairing-protocol';

    enum State {
        CLOSED = 0,
        OPENING = 1,
        READY = 2,
        CLOSING = 3,
    }

    interface HttpResponse {
        statusCode: number;
        headers: {
            [name: string]: string;
        };
        body: string;
    }

    class HttpConnection extends EventEmitter {
        address: string;
        port: number;
        state: State;
        socket: net.Socket;
        sessionKeys: SessionKeys;
        a2cCounter: number;
        c2aCounter: number;

        constructor(address: string, port: number);

        setSessionKeys(keys: SessionKeys): void;
        protected _open(): Promise<void>;

        get(path: string): Promise<HttpResponse>;
        post(path: string, body: Buffer | string, contentType?: string): Promise<HttpResponse>;
        put(path: string, body: Buffer | string, contentType?: string, readEvents?: boolean): Promise<HttpResponse>;
        request(body: Buffer | string, readEvents: boolean): Promise<HttpResponse>;

        private _encryptData(data: Buffer): Buffer;
        private _buildHttpResponseParser(resolve: unknown): unknown;
        private _requestEncrypted(data: Buffer | string, readEvents: boolean): Promise<HttpResponse>;
        private _requestClear(data: Buffer | string, readEvents: boolean): Promise<HttpResponse>;

        close(): void;
    }

    namespace HttpConnection {
        export {
            HttpResponse,
        };
    }

    export = HttpConnection;
}

declare module 'hap-controller/lib/transport/ip/ip-discovery' {
    import TypedEventEmitter from '@hap-server/types/typed-eventemitter';

    interface HapService {
        /** Accessory display name */
        name: string;
        /** Hostname/IP address */
        address: string;
        /** Port number */
        port: number;
        /** Configuration number/accessory database version */
        'c#': number;
        /** Pairing feature flags */
        ff: number;
        /** Device identifier */
        id: string;
        /** Device model */
        md: string;
        /** Protocol version */
        pv: string;
        /**
         * State number
         *
         * In v1 this must be 1.
         * */
        's#': number;
        /** Status flags */
        sf: number;
        /** Category */
        ci: number;
    }

    interface Events {
        'serviceUp': [HapService];
        'serviceDown': [HapService];
    }

    class IPDiscovery extends TypedEventEmitter<IPDiscovery, Events> {
        browser: unknown;

        constructor();

        private static _serviceToHapService;

        start(): void;
        stop(): void;
    }

    namespace IPDiscovery {
        export {
            HapService,
        };
    }

    export = IPDiscovery;
}
