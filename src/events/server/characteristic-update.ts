import {Event} from '..';
import {Server} from '../../server';
import {Accessory, Service, Characteristic} from '../../hap-nodejs';

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
}
