import {Event} from '..';
import {Server, PluginAccessory} from '../../server';
import {Accessory, Service, Characteristic} from 'hap-nodejs';
import {AccessoryStatus} from '../../common/types/accessories';

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
    constructor(server: Server, accessory: Accessory, service: Service, characteristic: Characteristic) {
        super(server, accessory, service, characteristic);
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
}

export class UpdateAccessoryStatusEvent extends Event {
    constructor(server: Server, accessory: PluginAccessory, status: AccessoryStatus) {
        super(server, accessory, status);
    }

    get server(): Server {
        return this.args[0];
    }

    get plugin_accessory(): PluginAccessory {
        return this.args[1];
    }

    get accessory(): Accessory {
        return this.plugin_accessory.accessory;
    }

    get status(): AccessoryStatus {
        return this.args[2];
    }
}
