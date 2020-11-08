import Server from '../server/server';
import {AuthenticatedUser} from '../server/plugins';
import * as ServerEvents from '../events/server';
import HistoryDatabase, {User as UserData, UserType, Record as RecordData} from './database';

import {Accessory, Service, Characteristic} from 'hap-nodejs';

export default class History {
    readonly server: Server;
    readonly database: HistoryDatabase;

    constructor(server: Server, database: HistoryDatabase) {
        this.server = server;
        this.database = database;

        this.server.on(ServerEvents.CharacteristicUpdateEvent, event => {
            const user = event.connection && event.connection.authenticated_user;

            const value = ['string', 'number', 'bigint'].includes(typeof event.value) ?
                `${event.value}` : JSON.stringify(event.value);

            this.addRecord(event.accessory, event.service, event.characteristic, value, user);
        });
    }

    static async init(server: Server, directory: string) {
        return new History(server, await HistoryDatabase.init(directory));
    }

    async addRecord(
        accessory: Accessory, service: Service, characteristic: Characteristic,
        value: string, user: AuthenticatedUser | HAPPairing | null = null, date = new Date(Date.now())
    ) {
        const [characteristic_id, user_id] = await Promise.all([
            this.database.getCharacteristicID(
                accessory.UUID, service.UUID, service.subtype || null, characteristic.UUID),
            !user ? null : user instanceof AuthenticatedUser ?
                this.database.getUserID(UserType.HAPSERVER, user.id, user.name) :
                this.database.getUserID(UserType.HAP_PAIRING, user.pairing_id, 'HomeKit user'),
        ]);

        console.log('[History] Adding record for cid %d, uid %d, date %s, value %s',
            characteristic_id, user_id, date.toString(), value);

        await this.database.addRecord(characteristic_id, value, user_id, date);
    }

    async findRecords(
        accessory: Accessory, service: Service, characteristic: Characteristic,
        from: Date, to: Date, include_last = true
    ) {
        const characteristic_id = await this.database.getCharacteristicID(
            accessory.UUID, service.UUID, service.subtype || null, characteristic.UUID);

        const records = await this.database.findRecords(characteristic_id, from, to, include_last);

        // As long as all users with the same IDs are retrieved at the same time the same object will be returned
        return Promise.all(records.map(async r => new Record(this, r, r.u ? await this.database.getUser(r.u) : null,
            accessory, service, characteristic)));
    }
}

export interface HAPPairing {
    /** UUID */
    pairing_id: string;
}

export interface User {
    id: string;
}

export class Record {
    readonly accessory: Accessory;
    readonly service: Service;
    readonly characteristic: Characteristic;
    readonly value: string;
    readonly user: User | HAPPairing | null;
    readonly date: Date;

    constructor(
        readonly history: History, record: RecordData, user: UserData | null,
        accessory: Accessory, service: Service, characteristic: Characteristic
    ) {
        this.accessory = accessory;
        this.service = service;
        this.characteristic = characteristic;
        this.value = record.v;
        this.user = !user ? null : user.t === UserType.HAP_PAIRING ? {
            pairing_id: user.u,
        } : {
            id: user.u,
        };
        this.date = new Date(record.d);
    }
}
