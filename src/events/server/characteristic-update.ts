/// <reference path="../../types/hap-nodejs.d.ts" />

import {Event} from '..';
import {Server} from '../../server';
import Connection, {ConnectionSymbol} from '../../server/connection';
import Bridge from '../../server/bridge';
import {Accessory, Service, Characteristic} from '../../hap-nodejs';
import {Session, EventedHTTPServerConnection} from 'hap-nodejs/lib/util/eventedhttp';

export class CharacteristicUpdateEvent extends Event {
    static readonly type = 'characteristic-update';

    constructor(
        server: Server, accessory: Accessory, service: Service, characteristic: Characteristic,
        value: any, old_value: any, hap_context: any
    ) {
        super(server, accessory, service, characteristic, value, old_value, hap_context);
    }

    get server(): Server {
        return this.args[0];
    }

    get accessory(): Accessory {
        return this.args[1];
    }

    get service(): Service {
        return this.args[2];
    }

    get characteristic(): Characteristic {
        return this.args[3];
    }

    get value() {
        return this.args[4];
    }

    get old_value() {
        return this.args[5];
    }

    get hap_context() {
        return this.args[6];
    }

    get connection(): Connection | null {
        if (!this.hap_context || !this.hap_context[ConnectionSymbol]) return null;

        return this.hap_context[ConnectionSymbol];
    }

    get hap_bridge(): Bridge | null {
        for (const bridge of this.server.accessories.bridges) {
            if (!bridge.hasOwnProperty('hap_server')) continue;

            for (const connection of bridge.hap_server.server._httpServer._connections) {
                if (connection._events !== this.hap_context) continue;

                Object.defineProperty(this, 'bridge', {value: bridge});
                Object.defineProperty(this, 'hap_connection', {value: connection});

                return bridge;
            }
        }

        return null;
    }

    get hap_connection(): EventedHTTPServerConnection | null {
        if (!this.hap_bridge) return null;

        return this.hap_bridge.hap_server.server._httpServer._connections
            .find(c => c._events === this.hap_context) || null;
    }

    get hap_session(): Session | null {
        if (!this.hap_connection) return null;

        return this.hap_connection._session;
    }
}
