import * as sqlite from 'sqlite';
import {Database as driver} from 'sqlite3';
import sql from 'sql-template-strings';
import {promises as fs} from 'fs';
import * as path from 'path';
import * as util from 'util';
import _mkdirp = require('mkdirp');

import {create_schema} from './schema';
import TypedEventEmitter from '../events/typed-eventemitter';

const mkdirp = util.promisify(_mkdirp);

interface Events {
    'close': [];

    'assigned-characteristic-id': [number, [string, string, string | null, string]];
    'assigned-user-id': [number, UserType, string];
    'record': [Record];
}

export default class HistoryDatabase extends TypedEventEmitter<HistoryDatabase, Events> {
    private readonly database: sqlite.Database;

    constructor(database: sqlite.Database) {
        super();
        this.database = database;
    }

    async close() {
        await this.database.close();

        // @ts-ignore
        this.database = null;

        this.emit('close');
    }

    static async init(directory: string) {
        await mkdirp(directory);

        try {
            const filename = path.join(directory, 'data-1-0.sqlite');
            await fs.stat(filename);
            const database = await sqlite.open({
                filename,
                driver,
            });

            return new HistoryDatabase(database);
        } catch (err) {
            await this.migrate(directory);

            try {
                const filename = path.join(directory, 'data-1-0.sqlite');
                await fs.stat(filename);
                const database = await sqlite.open({
                    filename,
                    driver,
                });

                return new HistoryDatabase(database);
            } catch (err) {
                // Latest database doesn't exist and there wasn't anything to migrate
                // Create a new database
                const filename = path.join(directory, 'data-1-0.sqlite');
                const database = await sqlite.open({
                    filename,
                    driver,
                });

                try {
                    await database.exec(create_schema);
                } catch (err) {
                    try {
                        await fs.unlink(filename);
                    } catch (err) {}

                    throw err;
                }

                return new HistoryDatabase(database);
            }
        }
    }

    static async migrate(directory: string) {
        // Nothing to migrate
    }

    private _getCharacteristicIDPromise = new Map<string, Promise<number>>();

    async getCharacteristicID(
        accessory_uuid: string, service_uuid: string, service_subtype: string | null, characteristic_uuid: string
    ): Promise<number>;
    async getCharacteristicID(accessory_uuid: string, service_id: string, characteristic_uuid: string): Promise<number>;
    async getCharacteristicID(
        accessory_uuid: string, service_id: string, service_id2: string, characteristic_uuid?: string
    ) {
        const service_uuid = characteristic_uuid ? service_id :
            service_id.substr(0, service_id.indexOf('.') > -1 ? service_id.indexOf('.') : service_id.length)
                .toLowerCase();
        const service_subtype = characteristic_uuid ? service_id2 :
            service_id.indexOf('.') > -1 ? service_id.substr(service_id.indexOf('.') + 1) : null;
        if (!characteristic_uuid) characteristic_uuid = service_id2;

        const id = [accessory_uuid, service_uuid, characteristic_uuid];
        if (typeof service_subtype === 'string') id.splice(2, 0, service_subtype);
        const key = id.join('.');

        if (!this._getCharacteristicIDPromise.has(key)) {
            this._getCharacteristicIDPromise.set(key, this._getCharacteristicID(
                accessory_uuid, service_uuid, service_subtype, characteristic_uuid
            ).then(id => {
                this._getCharacteristicIDPromise.delete(key);
                return id;
            }, err => {
                this._getCharacteristicIDPromise.delete(key);
                throw err;
            }));
        }

        return this._getCharacteristicIDPromise.get(key)!;
    }

    private async _getCharacteristicID(
        accessory_uuid: string, service_uuid: string, service_subtype: string | null, characteristic_uuid: string
    ) {
        const characteristic = await this.database.get(
            sql`SELECT i FROM c WHERE a = ${accessory_uuid} AND s = ${service_uuid} AND `
                .append(typeof service_subtype === 'string' ? sql`t = ${service_subtype}` : `t IS NULL`)
                .append(sql` AND c = ${characteristic_uuid}`));

        if (!characteristic) {
            const statement = await this.database.run(
                sql`INSERT INTO c (a, s, t, c) VALUES (${accessory_uuid}, ${service_uuid}, `
                    .append(typeof service_subtype === 'string' ? sql`${service_subtype}` : `NULL`)
                    .append(sql`, ${characteristic_uuid})`));

            this.emit('assigned-characteristic-id', statement.lastID!,
                [accessory_uuid, service_uuid, service_subtype, characteristic_uuid]);

            return statement.lastID!;
        }

        return characteristic.i as number;
    }

    private _getCharacteristicUUIDsPromise = new Map<number, Promise<Characteristic>>();

    async getCharacteristicUUIDs(characteristic_id: number): Promise<Characteristic | null> {
        if (!this._getCharacteristicUUIDsPromise.has(characteristic_id)) {
            this._getCharacteristicUUIDsPromise.set(characteristic_id, this._getCharacteristicUUIDs(characteristic_id)
                .then(id => {
                    this._getCharacteristicUUIDsPromise.delete(characteristic_id);
                    return id;
                }, err => {
                    this._getCharacteristicUUIDsPromise.delete(characteristic_id);
                    throw err;
                }));
        }

        return this._getCharacteristicUUIDsPromise.get(characteristic_id)! || null;
    }

    private async _getCharacteristicUUIDs(characteristic_id: number) {
        const characteristic: Characteristic | null =
            await this.database.get(sql`SELECT * FROM c WHERE i = ${characteristic_id}`) as Characteristic || null;

        return characteristic;
    }

    private _getUserIDPromise = new Map<string, Promise<number>>();

    async getUserID(type: UserType, id: string, name: string) {
        const key = `${type}.${id}`;

        if (!this._getUserIDPromise.has(key)) {
            this._getUserIDPromise.set(key, this._getUserID(type, id, name).then(id => {
                this._getUserIDPromise.delete(key);
                return id;
            }, err => {
                this._getUserIDPromise.delete(key);
                throw err;
            }));
        }

        return this._getUserIDPromise.get(key)!;
    }

    private async _getUserID(type: UserType, id: string, name: string) {
        const user = await this.database.get(sql`SELECT i FROM u WHERE t = ${type} AND u = ${id}`);
        if (user) return user.i as number;

        const statement = await this.database.run(
            sql`INSERT INTO u (t, u, n) VALUES (${type}, ${id}, ${name})`);

        this.emit('assigned-user-id', statement.lastID!, type, id);

        return statement.lastID!;
    }

    private _getUserPromise = new Map<number, Promise<User | null>>();

    async getUser(id: number) {
        if (!this._getUserPromise.has(id)) {
            this._getUserPromise.set(id, this._getUser(id).then(user => {
                this._getUserPromise.delete(id);
                return user;
            }, err => {
                this._getUserPromise.delete(id);
                throw err;
            }));
        }

        return this._getUserPromise.get(id)!;
    }

    private async _getUser(id: number): Promise<User | null> {
        const user: User | null = await this.database.get(
            sql`SELECT * FROM r WHERE i = ${id}`) as User || null;

        return user;
    }

    private _getRecordPromise = new Map<number, Promise<Record | null>>();

    async getRecord(id: number) {
        if (!this._getRecordPromise.has(id)) {
            this._getRecordPromise.set(id, this._getRecord(id).then(record => {
                this._getRecordPromise.delete(id);
                return record;
            }, err => {
                this._getRecordPromise.delete(id);
                throw err;
            }));
        }

        return this._getRecordPromise.get(id)!;
    }

    private async _getRecord(id: number): Promise<Record | null> {
        const record: Record | null = await this.database.get(
            sql`SELECT * FROM r WHERE i = ${id}`) as Record || null;

        return record;
    }

    async findRecords(characteristic_id: number, from: Date, to: Date, include_last = true) {
        const records = await this.database.all(
            sql`SELECT * FROM r WHERE c = ${characteristic_id} AND d > ${from} AND d <= ${to}`
                .append(include_last ?
                    sql` UNION SELECT * FROM (SELECT * FROM r WHERE c = ${characteristic_id} AND d <= ${from} ORDER BY d DESC LIMIT 1)` : ''));

        return records as Record[];
    }

    async addRecord(
        characteristic_id: number, value: string, user_id?: number | null, date = new Date(Date.now())
    ): Promise<Record> {
        const statement = await this.database.run(
            sql`INSERT INTO r (c, v, u, d) VALUES (${characteristic_id}, ${value}, ${user_id}, ${date})`);

        const record = {
            i: statement.lastID!,
            c: characteristic_id,
            v: value,
            u: user_id || null,
            d: date.getTime(),
        };

        this.emit('record', record);

        return record;
    }
}

export interface Characteristic {
    /** Characteristic ID */
    readonly i: number;
    /** Accessory UUID */
    readonly a: string;
    /** Service UUID */
    readonly s: string;
    /** Service subtype */
    readonly t: string | null;
    /** Characteristic UUID */
    readonly c: string;
}

export interface User {
    /** User record ID */
    readonly i: number;
    /** User type */
    readonly t: UserType;
    /** User/pairing ID */
    readonly u: string;
    /** Display name */
    readonly n: string;
}

export enum UserType {
    HAP_PAIRING = 0,
    HAPSERVER = 1,
}

export interface Record {
    /** Record ID */
    readonly i: number;
    /** Characteristic ID */
    readonly c: number;
    /** Characteristic value */
    readonly v: string;
    /** User ID */
    readonly u: number | null;
    /** Timestamp */
    readonly d: number;
}
