import {Event} from '..';
import {Server} from '../../server';
import {Automations, AutomationTrigger} from '../../automations';

export class AutomationTriggerEvent extends Event {
    static type = 'automation-trigger';
    static types = ['trigger'];

    readonly trigger: AutomationTrigger;
    readonly context: any;

    /**
     * Creates a TriggerEvent.
     *
     * @param {AutomationTrigger} trigger
     * @param {object} [context]
     */
    constructor(trigger: AutomationTrigger, context) {
        super();

        Object.defineProperty(this, 'trigger', {value: trigger});
        this.context = context || {};
    }

    get automations(): Automations {
        return this.trigger.automations;
    }

    get server(): Server {
        return this.automations.server;
    }
}
