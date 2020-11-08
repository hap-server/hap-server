import {Event} from '..';
import {Server} from '../../server';
import Connection, {ConnectionSymbol} from '../../server/connection';
import Bridge from '../../server/bridge';
import {Accessory, Service, Characteristic, AccessoryCharacteristicChange} from 'hap-nodejs';
import {HAPConnection} from 'hap-nodejs/dist/lib/util/eventedhttp';

export class CharacteristicUpdateEvent extends Event {
    static readonly type = 'characteristic-update';

    constructor(
        server: Server, accessory: Accessory, change: AccessoryCharacteristicChange
    ) {
        super(server, accessory, change);
    }

    get server(): Server {
        return this.args[0];
    }

    get accessory(): Accessory {
        return this.args[1];
    }

    get change(): AccessoryCharacteristicChange {
        return this.args[3];
    }

    get service(): Service {
        return this.change.service;
    }

    get characteristic(): Characteristic {
        return this.change.characteristic;
    }

    get value() {
        return this.change.newValue;
    }

    get old_value() {
        return this.change.oldValue;
    }

    get hap_context() {
        return this.change.context;
    }

    get connection(): Connection | null {
        if (!this.hap_context || !this.hap_context[ConnectionSymbol]) return null;

        return this.hap_context[ConnectionSymbol];
    }

    get hap_bridge(): Bridge | null {
        if (!this.hap_connection) return null;

        for (const bridge of this.server.accessories.bridges) {
            if (!bridge.hasOwnProperty('hap_server')) continue;
            if (!bridge.hap_server.connections.has(this.hap_connection)) continue;

            Object.defineProperty(this, 'hap_bridge', {value: bridge});
        }

        return null;
    }

    get hap_connection(): HAPConnection | null {
        return this.change.originator ?? null;
    }
}
