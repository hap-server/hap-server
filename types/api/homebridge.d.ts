/// <reference types="@hap-server/hap-server/types/homebridge" />

/**
 * Initialiser function called by Homebridge when loading plugins.
 * This function should register accessory and/or platform constructors.
 *
 * @param {API} homebridge The Homebridge API object plugins should use to register accessory/platform constructors
 */
export type InitFunction = (homebridge: import('homebridge/lib/api').API) => void;

export type Logger = import('homebridge/lib/logger').CallableLogger;
export type User = import('homebridge/lib/user').User;
export type PlatformAccessory = import('homebridge/lib/platformAccessory').PlatformAccessory;
export type API = import('homebridge/lib/api').API;
export type AccessoryConstructor = import('homebridge/lib/api').AccessoryConstructor;
export type AccessoryInstance = import('homebridge/lib/api').AccessoryInstance;
export type PlatformConstructor = import('homebridge/lib/api').PlatformConstructor;
export type PlatformInstance = import('homebridge/lib/api').PlatformInstance;
export type DynamicPlatformConstructor = import('homebridge/lib/api').DynamicPlatformConstructor;
export type DynamicPlatformInstance = import('homebridge/lib/api').DynamicPlatformInstance;
