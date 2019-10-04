import {Event} from '..';
import {Server, PluginAccessory} from '../../server';
import {Accessory, Service, Characteristic} from 'hap-nodejs';

export class AddAccessoryEvent extends Event {
    constructor(server: Server, plugin_accessory: PluginAccessory) {
        super(server, plugin_accessory);
    }

    get server(): Server {
        return this.args[0];
    }

    get plugin_accessory(): PluginAccessory {
        return this.args[1];
    }

    get accessory() {
        return this.plugin_accessory.accessory;
    }
}

export class RemoveAccessoryEvent extends Event {
    constructor(server: Server, plugin_accessory: PluginAccessory) {
        super(server, plugin_accessory);
    }

    get server(): Server {
        return this.args[0];
    }

    get plugin_accessory(): PluginAccessory {
        return this.args[1];
    }

    get accessory() {
        return this.plugin_accessory.accessory;
    }
}

export class UpdateAccessoryConfigurationEvent extends Event {
    constructor(server: Server, accessory: typeof Accessory, service: typeof Service, characteristic: typeof Characteristic) {
        super(server, accessory, service, characteristic);
    }

    get server(): Server {
        return this.args[0];
    }

    get accessory(): typeof Accessory {
        return this.args[1];
    }

    get service(): typeof Service {
        return this.args[2];
    }

    get characteristic(): typeof Characteristic {
        return this.args[3];
    }
}
