/// <reference path="./types/hap-nodejs.d.ts" />

//
// Re-exports hap-nodejs with correct types
//

interface HAPNodeJS {
    init(storagePath?: string): void;
    Accessory: typeof import('hap-nodejs/lib/Accessory').Accessory;
    Bridge: typeof import('hap-nodejs/lib/Bridge').Bridge;
    Camera: typeof import('hap-nodejs/lib/Camera').Camera;
    Service: typeof import('hap-nodejs/lib/Service').Service;
    Characteristic: typeof import('hap-nodejs/lib/Characteristic').Characteristic;
    uuid: typeof import('hap-nodejs/lib/util/uuid');
    AccessoryLoader: typeof import('hap-nodejs/lib/AccessoryLoader');
    StreamController: typeof import('hap-nodejs/lib/StreamController').StreamController;
    HAPServer: typeof import('hap-nodejs/lib/HAPServer').HAPServer;
}

// @ts-ignore
const hap: HAPNodeJS = require('hap-nodejs');

import './patches/hap-nodejs-security';
import './patches/hap-nodejs-async';

export const init = hap.init;
export const Accessory = hap.Accessory;
export const Bridge = hap.Bridge;
export const Camera = hap.Camera;
export const Service = hap.Service;
export const Characteristic = hap.Characteristic;
export const uuid = hap.uuid;
export const AccessoryLoader = hap.AccessoryLoader;
export const StreamController = hap.StreamController;
export const HAPServer = hap.HAPServer;

export type Accessory = import('hap-nodejs/lib/Accessory').Accessory;
export type Bridge = import('hap-nodejs/lib/Bridge').Bridge;
export type Camera = import('hap-nodejs/lib/Camera').Camera;
export type Service = import('hap-nodejs/lib/Service').Service;
export type Characteristic = import('hap-nodejs/lib/Characteristic').Characteristic;
export type StreamController = import('hap-nodejs/lib/StreamController').StreamController;
export type HAPServer = import('hap-nodejs/lib/HAPServer').HAPServer;
