import EventEmitter from 'events';

import PluginManager from '../core/plugins';

export default class AutomationCondition extends EventEmitter {
    /**
     * Creates an AutomationCondition.
     *
     * Automation condition should override the check function and return [a Promise resolving to] a boolean.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     */
    constructor(automations, config, uuid, log) {
        super();

        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationCondition.id++});
        Object.defineProperty(this, 'uuid', {value: uuid});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: log || automations.log.withPrefix('Condition #' + this.id)});
    }

    static load(automations, config, uuid, log) {
        const Condition = this.getConditionClass(config.condition, config.plugin);
        const condition = new Condition(automations, config, uuid, log);

        condition.load();

        return condition;
    }

    static getConditionClass(type, plugin_name) {
        if (plugin_name) {
            const plugin = PluginManager.getPlugin(plugin_name);

            if (!plugin) throw new Error('Unknown plugin "' + plugin_name + '"');
            if (!plugin.automation_conditions.has(type)) throw new Error('Unknown automation condition "' + type + // eslint-disable-line curly
                '" from plugin "' + plugin_name + '"');

            return plugin.automation_conditions.get(type);
        }

        const Condition = AutomationCondition.types[type];
        if (!Condition) throw new Error('Unknown automation condition "' + type + '"');

        return Condition;
    }

    load() {
        //
    }

    /**
     * Checks if an automation using this condition should trigger.
     *
     * @param {AutomationRunner} runner
     * @param {function} setProgress
     * @return {Promise<boolean>}
     */
    async check(runner) {
        throw new Error('AutomationCondition did not override the check function');
    }
}

AutomationCondition.id = 0;
AutomationCondition.types = {};

/**
 * An AutomationCondition that always passes.
 */
export class TestCondition extends AutomationCondition {
    check(runner) {
        this.log('Running test condition', runner);

        return true;
    }
}

AutomationCondition.types.test = TestCondition;

/**
 * An AutomationCondition that passes if any of it's child conditions passes.
 */
export class AnyCondition extends AutomationCondition {
    async load() {
        this.conditions = await Promise.all(this.config.conditions.map((config, index) =>
            this.automations.loadAutomationCondition(config, null, this.log.withPrefix('Child #' + index +
                ' (' + (AutomationCondition.id + 1) + ')'))));
    }

    async check(runner) {
        this.log('Running any condition', runner);

        for (const condition of this.conditions) {
            try {
                this.log.debug('Running condition #%d child #%d', this.id, condition.id);
                const result = await condition.check(runner);

                if (result) {
                    this.log.info('Condition #%d passing as child #%d passed', this.id, condition.id);
                    return true;
                }

                this.log.info('Condition #%d child #%d failed', this.id, condition.id);
            } catch (err) {
                this.log.error('Error in automation condition', err);
            }
        }

        return false;
    }
}

AutomationCondition.types.any = AnyCondition;

/**
 * An AutomationCondition that passed if all of it's child conditions pass.
 */
export class AllCondition extends AutomationCondition {
    async load() {
        this.conditions = await Promise.all(this.config.conditions.map((config, index) =>
            this.automations.loadAutomationCondition(config, null, this.log.withPrefix('Child #' + index +
                ' (' + (AutomationCondition.id + 1) + ')'))));
    }

    async check(runner) {
        this.log('Running all condition', runner);

        for (const condition of this.conditions) {
            try {
                this.log.debug('Running condition #%d child #%d', this.id, condition.id);
                const result = await condition.check(runner);

                if (!result) {
                    this.log.info('Failing condition #%d as child #%d failed', this.id, condition.id);
                    return false;
                }

                this.log.info('Condition #%d child #%n passed', this.id, condition.id);
            } catch (err) {
                this.log.error('Error in automation condition', err);
                return false;
            }
        }

        return true;
    }
}

AutomationCondition.types.all = AllCondition;
