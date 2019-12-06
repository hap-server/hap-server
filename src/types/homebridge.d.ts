declare module 'homebridge/lib/server' {
    export const Server: any;
    export type Server = any;
}

declare module 'homebridge/lib/platformAccessory' {
    export const PlatformAccessory: any;
    export type PlatformAccessory = any;
}

declare module 'homebridge/lib/plugin' {
    export const Plugin: any;
    export type Plugin = any;
}

declare module 'homebridge/lib/user' {
    export const User: any;
    export type User = any;
}

declare module 'homebridge/lib/logger' {
    export function setDebugEnabled(debugEnabled: boolean): void;
    export function setTimestampEnabled(timestampEnabled: boolean): void;
    export function forceColor(): void;
    export const _system: any;
}
