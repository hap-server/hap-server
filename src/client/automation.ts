import {EventEmitter} from 'events';
import isEqual = require('lodash.isequal');
import Connection from './connection';

import {Automation as AutomationData} from '../common/types/storage';
import {GetAutomationsPermissionsResponseMessage} from '../common/types/messages';

let id = 0;

class Automation extends EventEmitter {
    readonly id: number;
    connection: Connection;
    readonly uuid: string;

    _data!: AutomationData;
    _permissions!: GetAutomationsPermissionsResponseMessage[0];

    /**
     * Creates an Automation.
     *
     * @param {Connection} connection
     * @param {string} uuid
     * @param {object} data
     * @param {object} permissions
     */
    constructor(
        connection: Connection, uuid: string, data?: AutomationData,
        permissions?: GetAutomationsPermissionsResponseMessage[0]
    ) {
        super();

        this.id = id++;

        this.connection = connection;
        this.uuid = uuid;
        this._setPermissions(permissions || {get: false, set: false, delete: false});
        this._setData(data || {});
    }

    get live(): Automation {
        return this;
    }

    get staged(): StagedAutomation {
        return Object.defineProperty(this, 'staged', {enumerable: true, value: new StagedAutomation(this)}).staged;
    }

    get changed() {
        return !isEqual(this.live.data, this.staged.data);
    }

    get data(): AutomationData {
        return this._data;
    }

    get live_data() {
        return this.live.data;
    }

    get staged_data() {
        return this.staged.data;
    }

    _setData(data: AutomationData) {
        if (!this.staged.data || !this.changed) this.staged._setData(JSON.parse(JSON.stringify(data)));

        this._data = Object.freeze(data);

        this.emit('data-updated');
    }

    async updateData(data: AutomationData) {
        await this.connection.setAutomation(this.uuid, data);
        this._setData(data);
    }

    resetStagedAutomation() {
        this.staged._setData(JSON.parse(JSON.stringify(this.live.data)));
    }

    _setPermissions(permissions: GetAutomationsPermissionsResponseMessage[0]) {
        permissions.get = !!permissions.get;
        permissions.set = !!permissions.set;
        permissions.delete = !!permissions.delete;

        this._permissions = Object.freeze(permissions);

        this.emit('permissions-updated', permissions);
    }

    get can_get(): boolean {
        return this._permissions.get;
    }

    get can_set(): boolean {
        return this._permissions.set;
    }

    get can_delete(): boolean {
        return this._permissions.delete;
    }
}

type AutomationEvents = {
    'data-updated': (this: Automation, here: boolean) => void;
    'permissions-updated': (this: Automation, permissions: GetAutomationsPermissionsResponseMessage[0]) => void;
};

interface Automation {
    addListener<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    on<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    once<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    prependListener<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    prependOnceListener<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    removeListener<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    off<E extends keyof AutomationEvents>(event: E, listener: AutomationEvents[E]): this;
    removeAllListeners<E extends keyof AutomationEvents>(event: E): this;
    listeners<E extends keyof AutomationEvents>(event: E): AutomationEvents[E][];
    rawListeners<E extends keyof AutomationEvents>(event: E): AutomationEvents[E][];

    emit<E extends keyof AutomationEvents>(event: E, ...data: any[]): boolean;

    eventNames(): (keyof AutomationEvents)[];
    listenerCount<E extends keyof AutomationEvents>(type: E): number;
}

export default Automation;

export class StagedAutomation extends Automation {
    readonly automation!: Automation;

    /**
     * Create a mutable automation.
     *
     * @param {Automation} automation
     */
    constructor(automation: Automation) {
        if (automation instanceof StagedAutomation) return automation = automation.staged;
        super(automation.connection, automation.uuid);

        this.automation = automation;
        this._data = JSON.parse(JSON.stringify(automation.live.data || null));
    }

    get live() {
        return this.automation;
    }

    get staged(): StagedAutomation {
        return this;
    }

    // @ts-expect-error
    get id() {
        return this.automation.id;
    }
    set id(id) {}

    // @ts-expect-error
    get connection() {
        return this.automation.connection;
    }
    set connection(connection) {}

    // @ts-expect-error
    get uuid() {
        return this.automation.uuid;
    }
    set uuid(uuid) {}

    // @ts-expect-error
    get _permissions() {
        return this.automation._permissions;
    }
    set _permissions(_permissions) {}

    _setData(data: AutomationData) {
        this._data = data;
    }

    async updateData(data: AutomationData) {
        this._setData(data);
    }

    save() {
        if (!this.uuid) throw new Error('This automation doesn\'t exist');

        return this.automation.updateData(JSON.parse(JSON.stringify(this.data)));
    }
}
