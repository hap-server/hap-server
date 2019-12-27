
export interface AccessoryHap {
    aid: number;
    services: ServiceHap[];
}

export interface ServiceHap {
    iid: number;
    type: string;
    characteristics: CharacteristicHap[];

    primary?: boolean;
    hidden?: boolean;
    linked?: number[];

    // Custom values recognised by the web interface client
    subtype?: string;
    linked_indexes?: number[];
}

export enum CharacteristicFormat {
    BOOL = 'bool',
    INT = 'int',
    FLOAT = 'float',
    STRING = 'string',
    UINT8 = 'uint8',
    UINT16 = 'uint16',
    UINT32 = 'uint32',
    UINT64 = 'uint64',
    DATA = 'data',
    TLV8 = 'tlv8',
    ARRAY = 'array',
    DICTIONARY = 'dict',
}

export enum CharacteristicUnit {
    CELSIUS = 'celsius',
    PERCENTAGE = 'percentage',
    ARC_DEGREE = 'arcdegrees',
    LUX = 'lux',
    SECONDS = 'seconds',
}

export enum CharacteristicPerms {
    PAIRED_READ = 'pr',
    PAIRED_WRITE = 'pw',
    EVENTS = 'ev',
    ADDITIONAL_AUTHORIZATION = 'aa',
    TIMED_WRITE = 'tw',
    HIDDEN = 'hd',
    WRITE_RESPONSE = 'wr',
}

export interface CharacteristicHap {
    iid: number;
    type: string;
    perms: CharacteristicPerms[];
    format: CharacteristicFormat;

    value?: any;

    description: string;

    events?: boolean;
    bonjour?: boolean;

    'valid-values'?: any[];
    'valid-values-range'?: [number, number];

    unit?: CharacteristicUnit;
    maxValue?: number;
    minValue?: number;
    minStep?: number;
    maxLen?: number;

    // Custom values recognised by the web interface client
    status?: number;
}
