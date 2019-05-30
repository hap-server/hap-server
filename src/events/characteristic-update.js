import Events, {Event} from '.';

export default class CharacteristicUpdateEvent extends Event {
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

CharacteristicUpdateEvent.type = 'characteristic-update';
Events.CharacteristicUpdateEvent = CharacteristicUpdateEvent;
