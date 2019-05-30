import Events, {Event} from '.';

export class AddAccessoryEvent extends Event {
    get server() {
        return this.args[0];
    }

    get plugin_accessory() {
        return this.args[1];
    }

    get accessory() {
        return this.plugin_accessory.accessory;
    }
}

Events.AddAccessoryEvent = AddAccessoryEvent;

export class RemoveAccessoryEvent extends Event {
    get server() {
        return this.args[0];
    }

    get plugin_accessory() {
        return this.args[1];
    }

    get accessory() {
        return this.plugin_accessory.accessory;
    }
}

Events.RemoveAccessoryEvent = RemoveAccessoryEvent;

export class UpdateAccessoryConfigurationEvent extends Event {
    get server() {
        return this.args[0];
    }

    get accessory() {
        return this.args[1];
    }

    get service() {
        return this.args[2];
    }

    get characteristic() {
        return this.args[3];
    }
}

Events.UpdateAccessoryConfigurationEvent = UpdateAccessoryConfigurationEvent;
