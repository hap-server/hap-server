import {Event} from '..';
import {Server} from '../../server';
import Automations, {AutomationRunner} from '../../automations';
import AutomationTrigger from '../../automations/trigger';
import AutomationAction from '../../automations/action';

export class AutomationTriggerEvent extends Event {
    static type = 'automation-trigger';
    static types = ['trigger'];

    readonly trigger!: AutomationTrigger | AutomationAction;
    readonly context: any;

    /**
     * Creates a TriggerEvent.
     *
     * @param {AutomationTrigger} trigger
     * @param {object} [context]
     */
    constructor(trigger: AutomationTrigger | AutomationAction, context?: any) {
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

AutomationTriggerEvent.type = 'automation-trigger';
AutomationTriggerEvent.types = ['trigger'];

export class AutomationRunningEvent extends Event {
    readonly runner!: AutomationRunner;

    constructor(runner: AutomationRunner) {
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
