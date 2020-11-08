import {Formats as CharacteristicFormat, Units as CharacteristicUnit, Perms as CharacteristicPerms} from 'hap-nodejs';

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

export {
    CharacteristicFormat,
    CharacteristicUnit,
    CharacteristicPerms,
};

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
