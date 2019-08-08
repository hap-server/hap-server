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

export class AutomationRunningEvent extends Event {
    constructor(runner) {
        super();

        Object.defineProperty(this, 'runner', {value: runner});
    }

    get automation() {
        return this.runner.automation;
    }

    get automations() {
        return this.automation.automations;
    }

    get server() {
        return this.automations.server;
    }

    /**
     * @return {AutomationTriggerEvent}
     */
    get event() {
        return this.runner.event;
    }

    get trigger() {
        return this.event.trigger;
    }
}
