import * as cron from 'node-cron';
import {Timezone} from 'tz-offset';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {getSunrise, getSunset} = require('sunrise-sunset-js') as {
    getSunrise(latitude: number, longitude: number, date?: Date): Date;
    getSunset(latitude: number, longitude: number, date?: Date): Date;
};

import Events, {EventListener} from '../events';
import {AutomationTriggerEvent as TriggerEvent, SceneActivatedEvent} from '../events/server';

import Automations from '.';
import PluginManager from '../server/plugins';
import Logger from '../common/logger';
import {AutomationTriggerConfiguration} from '../cli/configuration';

export default class AutomationTrigger extends Events {
    private static id = 0;
    static readonly types: {
        [key: string]: typeof AutomationTrigger;
    } = {};

    readonly automations!: Automations;
    readonly id!: number;
    readonly uuid!: string | null;
    readonly config: any;
    readonly log!: Logger;

    private running = false;
    private starting: Promise<boolean> | null = null;
    private stopping: Promise<boolean> | null = null;

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
    constructor(automations: Automations, config?: any, uuid?: string, log?: Logger) {
        super();

        this.parent_emitter = automations;
        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationTrigger.id++});
        Object.defineProperty(this, 'uuid', {value: uuid || null});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: log || automations.log.withPrefix('Trigger #' + this.id)});
    }

    static load(automations: Automations, config: any, uuid?: string, log?: Logger) {
        const Trigger = this.getTriggerClass(config.trigger, config.plugin);
        const trigger = new Trigger(automations, config, uuid, log);

        return trigger;
    }

    static getTriggerClass(type: string, plugin_name: string) {
        if (plugin_name) {
            const plugin = PluginManager.getPlugin(plugin_name);

            if (!plugin) throw new Error('Unknown plugin "' + plugin_name + '"');
            if (!plugin.automation_triggers.has(type)) throw new Error('Unknown automation trigger "' + type + // eslint-disable-line curly
                '" from plugin "' + plugin_name + '"');

            return plugin.automation_triggers.get(type)!;
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
    trigger(context?: any) {
        if (!this.running) throw new Error('Cannot trigger when not running');

        const event = new TriggerEvent(this, context);

        this.emit(event, this, context);

        return event;
    }
}

type CronTriggerType = 'Cron';

export interface CronTriggerConfiguration extends AutomationTriggerConfiguration {
    readonly plugin: undefined;
    readonly trigger: CronTriggerType;

    readonly expression: string;
    readonly timezone: Timezone;
}

/**
 * An AutomationTrigger that runs based on a cron schedule.
 */
export class CronTrigger extends AutomationTrigger {
    readonly config!: CronTriggerConfiguration;

    private task: cron.ScheduledTask | null = null;

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

export interface SunriseTriggerConfiguration extends AutomationTriggerConfiguration {
    readonly plugin: undefined;
    readonly trigger: 'Sunrise';

    readonly latitude: number;
    readonly longitude: number;
}

export class SunriseTrigger extends AutomationTrigger {
    readonly config!: SunriseTriggerConfiguration;

    private timeout: NodeJS.Timeout | null = null;
    // eslint-disable-next-line no-invalid-this
    private timeout_callback = this.timeoutCallback.bind(this);

    onstart() {
        if (this.timeout) clearTimeout(this.timeout), this.timeout = null;

        const next_sunrise_time = this.getNextSunrise();
        this.log.debug('Next sunrise at %s', next_sunrise_time.toString());

        this.timeout = setTimeout(this.timeout_callback, next_sunrise_time.getTime() - Date.now());
    }

    getNextSunrise() {
        const next_sunrise_time = getSunrise(this.config.latitude, this.config.longitude);

        if (Date.now() > next_sunrise_time.getTime()) {
            // Sunrise already passed this day
            const DAY = 1000 * 60 * 60 * 24; // 1 second * in 1 minute * in 1 hour * in 1 day
            return getSunrise(this.config.latitude, this.config.longitude, new Date(Date.now() + DAY));
        }

        return next_sunrise_time;
    }

    timeoutCallback() {
        this.trigger();

        const next_sunrise_time = this.getNextSunrise();
        this.log.debug('Triggered sunrise event, next sunrise at %s', next_sunrise_time.toString());

        clearTimeout(this.timeout!);
        this.timeout = setTimeout(this.timeout_callback, next_sunrise_time.getTime() - Date.now());
    }

    onstop() {
        if (!this.timeout) return;

        clearTimeout(this.timeout);
        this.timeout = null;
    }
}

AutomationTrigger.types.Sunrise = SunriseTrigger;

export interface SunsetTriggerConfiguration extends AutomationTriggerConfiguration {
    readonly plugin: undefined;
    readonly trigger: 'Sunset';

    readonly latitude: number;
    readonly longitude: number;
}

export class SunsetTrigger extends AutomationTrigger {
    readonly config!: SunsetTriggerConfiguration;

    private timeout: NodeJS.Timeout | null = null;
    // eslint-disable-next-line no-invalid-this
    private timeout_callback = this.timeoutCallback.bind(this);

    onstart() {
        if (this.timeout) clearTimeout(this.timeout), this.timeout = null;

        const next_sunset_time = this.getNextSunset();
        this.log.debug('Next sunset at %s', next_sunset_time.toString());

        this.timeout = setTimeout(this.timeout_callback, next_sunset_time.getTime() - Date.now());
    }

    getNextSunset() {
        const next_sunset_time = getSunset(this.config.latitude, this.config.longitude);

        if (Date.now() >= next_sunset_time.getTime()) {
            // Sunset already passed this day
            const DAY = 1000 * 60 * 60 * 24; // 1 second * in 1 minute * in 1 hour * in 1 day
            return getSunset(this.config.latitude, this.config.longitude, new Date(Date.now() + DAY));
        }

        return next_sunset_time;
    }

    timeoutCallback() {
        this.trigger();

        const next_sunset_time = this.getNextSunset();
        this.log.debug('Triggered sunset event, next sunset at %s', next_sunset_time.toString());

        clearTimeout(this.timeout!);
        this.timeout = setTimeout(this.timeout_callback, next_sunset_time.getTime() - Date.now());
    }

    onstop() {
        if (!this.timeout) return;

        clearTimeout(this.timeout);
        this.timeout = null;
    }
}

AutomationTrigger.types.Sunset = SunsetTrigger;

type SceneTriggerType = 'Scene';

export interface SceneTriggerConfiguration extends AutomationTriggerConfiguration {
    readonly plugin: undefined;
    readonly trigger: SceneTriggerType;

    readonly scene_uuid: string;
}

/**
 * An AutomationTrigger that runs when a scene is triggered.
 */
export class SceneTrigger extends AutomationTrigger {
    readonly config!: SceneTriggerConfiguration;

    private listener: EventListener | null = null;

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
