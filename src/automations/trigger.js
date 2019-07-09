import cron from 'node-cron';

import Events from '../events';
import {AutomationTriggerEvent as TriggerEvent, SceneActivatedEvent} from '../events/server';

import PluginManager from '../server/plugins';

export default class AutomationTrigger extends Events {
    /**
     * Creates an AutomationTrigger.
     *
     * Automation triggers should emit a "trigger" event when automations should run.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     */
    constructor(automations, config, uuid, log) {
        super();

        this.parent_emitter = automations;
        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationTrigger.id++});
        Object.defineProperty(this, 'uuid', {value: uuid});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: log || automations.log.withPrefix('Trigger #' + this.id)});

        this.running = false;
        this.starting = null;
        this.stopping = null;
    }

    static load(automations, config, uuid, log) {
        const Trigger = this.getTriggerClass(config.trigger, config.plugin);
        const trigger = new Trigger(automations, config, uuid, log);

        return trigger;
    }

    static getTriggerClass(type, plugin_name) {
        if (plugin_name) {
            const plugin = PluginManager.getPlugin(plugin_name);

            if (!plugin) throw new Error('Unknown plugin "' + plugin_name + '"');
            if (!plugin.automation_triggers.has(type)) throw new Error('Unknown automation trigger "' + type + // eslint-disable-line curly
                '" from plugin "' + plugin_name + '"');

            return plugin.automation_triggers.get(type);
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

        return this.starting = Promise.all([this.onstart()]).then(() => (this.starting = null, this.running = true));
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

        return this.stopping = Promise.all([this.onstop()])
            .then(() => (this.starting = null, this.running = false))
            .then(() => true);
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
        if (!this.running) throw new Error('Cannot trigger when not running');

        const event = new TriggerEvent(this, context);

        this.emit(event, this, context);

        return event;
    }
}

AutomationTrigger.id = 0;
AutomationTrigger.types = {};

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

AutomationTrigger.types.Cron = CronTrigger;

/**
 * An AutomationTrigger that runs when a scene is triggered.
 */
export class SceneTrigger extends AutomationTrigger {
    onstart() {
        if (this.listener) this.listener.cancel(), this.listener = null;

        this.listener = this.automations.server.listen(SceneActivatedEvent, event => {
            if (event.scene.uuid !== this.config.scene_uuid) return;

            this.trigger({parent: event});
        });
    }

    onstop() {
        if (!this.listener) return;

        this.listener.cancel();
        this.listener = null;
    }
}

AutomationTrigger.types.Scene = SceneTrigger;
