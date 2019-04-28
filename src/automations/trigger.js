import EventEmitter from 'events';
import cron from 'node-cron';

export default class AutomationTrigger extends EventEmitter {
    /**
     * Creates an AutomationTrigger.
     *
     * Automation triggers should emit a "trigger" event when automations should run.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     */
    constructor(automations, config, uuid) {
        super();

        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationTrigger.id++});
        Object.defineProperty(this, 'uuid', {value: uuid});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: automations.log.withPrefix('Trigger #' + this.id)});

        this.running = false;
        this.starting = null;
        this.stopping = null;
    }

    static load(automations, config, uuid) {
        const Trigger = this.getTriggerClass(config.trigger, config.plugin);
        const trigger = new Trigger(automations, config, uuid);

        return trigger;
    }

    static getTriggerClass(type, plugin_name) {
        if (plugin_name) {
            //
        }

        const Trigger = AutomationTrigger.types[type];
        if (!Trigger) throw new Error('Unknown automation trigger "' + type + '"');

        return Trigger;
    }

    /**
     * Starts the automation trigger.
     *
     * @return {Promise}
     */
    async start() {
        if (this.stopping) await this.stopping;
        if (this.running) return;
        if (this.starting) return this.starting;

        return this.starting = Promise.all([this.onstart()]).then(() => this.running = true);
    }

    onstart() {
        throw new Error('AutomationTrigger did not override the onstart function');
    }

    /**
     * Stops the automation trigger.
     *
     * @return {Promise}
     */
    async stop() {
        if (this.starting) await this.starting;
        if (!this.running) return;
        if (this.stopping) return this.stopping;

        return this.stopping = Promise.all(this.onstart()).then(() => this.running = false).then(() => true);
    }

    onstop() {
        throw new Error('AutomationTrigger did not override the onstop function');
    }

    /**
     * Emits a trigger event.
     *
     * @param {object} [context]
     * @return {TriggerEvent}
     */
    trigger(context) {
        const event = new TriggerEvent(this, context);

        this.log.info('Triggered', event);

        this.emit('trigger', event);

        return event;
    }
}

AutomationTrigger.id = 0;
AutomationTrigger.types = {};

export class TriggerEvent {
    /**
     * Creates a TriggerEvent.
     *
     * @param {AutomationTrigger} trigger
     * @param {object} [context]
     */
    constructor(trigger, context) {
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

/**
 * An AutomationTrigger that runs based on a cron schedule.
 */
export class CronTrigger extends AutomationTrigger {
    onstart() {
        if (this.task) this.task.destroy(), this.task = null;

        this.task = cron.schedule(this.config.expression, () => this.trigger(), {
            timezone: this.config.timezone,
        });
    }

    onstop() {
        if (!this.task) return;

        this.task.destroy();
        this.task = null;
    }
}

AutomationTrigger.types.cron = CronTrigger;
