import {TypedEmitter} from 'tiny-typed-emitter';
import isEqual = require('lodash.isequal');
import Connection from './connection';

import {Automation as AutomationData} from '../common/types/storage';
import {GetAutomationsPermissionsResponseMessage} from '../common/types/messages';

let id = 0;

export default class Automation extends TypedEmitter<AutomationEvents> {
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

        this.emit('data-updated', false);
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

interface AutomationEvents {
    'data-updated': (this: Automation, here: boolean) => void;
    'permissions-updated': (this: Automation, permissions: GetAutomationsPermissionsResponseMessage[0]) => void;
}

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

for (const key of ['id', 'connection', 'uuid', '_permissions'] as const) {
    Object.defineProperty(StagedAutomation.prototype, key, {
        configurable: true,
        get(this: StagedAutomation): unknown {
            return this.automation[key];
        },
        set(this: StagedAutomation, value: unknown) {},
    });
}
