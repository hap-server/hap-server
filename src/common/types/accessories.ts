
export enum AccessoryStatus {
    /** Initial startup phase - can't be set by accessories */
    WAITING,
    READY,
    NOT_READY,
    CONNECTING,
    DISCONNECTING,
    /** Accessory handler throws - or accessory emits an error?? */
    ERROR,
    /** Accessory was removed from the server - can't be set by accessories */
    DESTROYED,
}

// Freeze the AccessoryStatus enum so Vue doesn't watch it
// Not really important but there's no point having Vue watch it as it shouldn't ever change
Object.freeze(AccessoryStatus);
