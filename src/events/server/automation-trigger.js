import {Event} from '..';

export class AutomationTriggerEvent extends Event {
    /**
     * Creates a TriggerEvent.
     *
     * @param {AutomationTrigger} trigger
     * @param {object} [context]
     */
    constructor(trigger, context) {
        super();

        Object.defineProperty(this, 'trigger', {value: trigger});
        this.context = context || {};
    }

    get automations() {
        return this.trigger.automations;
    }

    get server() {
        return this.automations.server;
    }
}

AutomationTriggerEvent.type = 'automation-trigger';
AutomationTriggerEvent.types = ['trigger'];
