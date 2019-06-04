import PluginManager from '../core/plugins';

import EventEmitter from 'events';
import vm from 'vm';

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
     * @param {AutomationCondition} ...parent_conditions
     * @return {Promise<boolean>}
     */
    async check(runner, setProgress) {
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
        this.log.info('Running test condition with runner #%d', runner.id);

        return true;
    }
}

AutomationCondition.types.Test = TestCondition;

/**
 * An AutomationCondition that passes if any of it's child conditions passes.
 */
export class AnyCondition extends AutomationCondition {
    async load() {
        this.conditions = await Promise.all(this.config.conditions.map((config, index) =>
            this.automations.loadAutomationCondition(config, null, this.log.withPrefix('Child #' + index +
                ' (' + (AutomationCondition.id + 1) + ')'))));
    }

    async check(runner, setProgress, ...parent_conditions) {
        this.log.info('Running any condition with runner #%d', runner.id);

        for (let index in this.conditions) { // eslint-disable-line guard-for-in
            index = parseInt(index);
            const condition = this.conditions[index];

            try {
                this.log.debug('Running condition #%d child #%d', this.id, condition.id);

                let finished = false;

                const result = await condition.check(runner, progress => {
                    if (finished) throw new Error('Cannot update progress after the condition has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.conditions.length);
                }, this, ...parent_conditions);

                finished = true;

                if (result) {
                    this.log.debug('Condition #%d passing as child #%d passed', this.id, condition.id);
                    return true;
                }

                this.log.debug('Condition #%d child #%d failed', this.id, condition.id);
            } catch (err) {
                this.log.error('Error in automation condition', err);
            }

            setProgress((index + 1) / this.conditions.length);
        }

        return false;
    }
}

AutomationCondition.types.Any = AnyCondition;

/**
 * An AutomationCondition that passed if all of it's child conditions pass.
 */
export class AllCondition extends AutomationCondition {
    async load() {
        this.conditions = await Promise.all(this.config.conditions.map((config, index) =>
            this.automations.loadAutomationCondition(config, null, this.log.withPrefix('Child #' + index +
                ' (' + (AutomationCondition.id + 1) + ')'))));
    }

    async check(runner, setProgress, ...parent_conditions) {
        this.log('Running all condition with runner #%d', runner.id);

        for (let index in this.conditions) { // eslint-disable-line guard-for-in
            index = parseInt(index);
            const condition = this.conditions[index];

            try {
                this.log.debug('Running condition #%d child #%d', this.id, condition.id);

                let finished = false;

                const result = await condition.check(runner, progress => {
                    if (finished) throw new Error('Cannot update progress after the condition has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.conditions.length);
                }, this, ...parent_conditions);

                finished = true;
                setProgress((index + 1) / this.conditions.length);

                if (!result) {
                    this.log.debug('Failing condition #%d as child #%d failed', this.id, condition.id);
                    return false;
                }

                this.log.debug('Condition #%d child #%d passed', this.id, condition.id);
            } catch (err) {
                this.log.error('Error in automation condition', err);
                throw err;
            }
        }

        return true;
    }
}

AutomationCondition.types.All = AllCondition;

/**
 * An AutomationCondition that runs a JavaScript VM.
 */
export class ScriptCondition extends AutomationCondition {
    load() {
        this.sandbox = Object.freeze({
            server: this.automations.server,
            getAccessory: this.automations.server.getAccessory.bind(this.automations.server),
            getService: this.automations.server.getService.bind(this.automations.server),
            getCharacteristic: this.automations.server.getCharacteristic.bind(this.automations.server),

            automations: this.automations,
            automation_condition: this,
            log: this.log.withPrefix('Script'),
        });

        this.script = new vm.Script(
            '(async function () { ' +
            (this.config.script instanceof Array ? this.config.script.join('\n') : this.config.script) +
            '\n})()'
        );
    }

    async check(runner, setProgress, ...parent_conditions) {
        this.log.debug('Running script condition #%d', this.id);

        const sandbox = Object.create(this.sandbox);

        sandbox.automation = runner.automation;
        sandbox.automation_runner = runner;
        sandbox.setAutomationProgress = setProgress;
        sandbox.parent_automation_conditions = parent_conditions;

        Object.freeze(sandbox);

        const sandbox_context = vm.createContext(sandbox);
        return await this.script.runInContext(sandbox_context);
    }
}

AutomationCondition.types.Script = ScriptCondition;
