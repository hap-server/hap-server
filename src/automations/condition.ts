import PluginManager from '../server/plugins';

import EventEmitter from 'events';
import vm from 'vm';

import Server from '../server/server';
import Automations, {AutomationRunner} from '.';
import Scene from './scene';
import Logger from '../common/logger';
import {Accessory, Service, Characteristic} from 'hap-nodejs';
import {AutomationConditionConfiguration} from '../cli/configuration';

export default class AutomationCondition extends EventEmitter {
    private static id = 0;
    static readonly types: {
        [key: string]: typeof AutomationCondition;
    } = {};

    readonly automations!: Automations;
    readonly id!: number;
    readonly uuid!: string | null;
    readonly config: any;
    readonly log!: Logger;

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
    constructor(automations: Automations, config?: any, uuid?: string, log?: Logger) {
        super();

        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationCondition.id++});
        Object.defineProperty(this, 'uuid', {value: uuid || null});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: log || automations.log.withPrefix('Condition #' + this.id)});
    }

    static load(automations: Automations, config: any, uuid?: string, log?: Logger) {
        const Condition = this.getConditionClass(config.condition, config.plugin);
        const condition = new Condition(automations, config, uuid, log);

        condition.load();

        return condition;
    }

    static getConditionClass(type: string, plugin_name: string) {
        if (plugin_name) {
            const plugin = PluginManager.getPlugin(plugin_name);

            if (!plugin) throw new Error('Unknown plugin "' + plugin_name + '"');
            if (!plugin.automation_conditions.has(type)) throw new Error('Unknown automation condition "' + type + // eslint-disable-line curly
                '" from plugin "' + plugin_name + '"');

            return plugin.automation_conditions.get(type)!;
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
     * @param {(AutomationRunner|Scene)} runner
     * @param {function} setProgress
     * @param {AutomationCondition} ...parent_conditions
     * @return {Promise<boolean>}
     */
    async check(runner: AutomationRunner | Scene, setProgress: (progress: number) => void, ...parent_conditions: AutomationCondition[]): Promise<boolean> {
        throw new Error('AutomationCondition did not override the check function');
    }
}

/**
 * An AutomationCondition that always passes.
 */
export class TestCondition extends AutomationCondition {
    async check(runner: AutomationRunner) {
        this.log.info('Running test condition with runner #%d', runner.id);

        return true;
    }
}

AutomationCondition.types.Test = TestCondition;

type AnyConditionType = 'Conditional';

export interface AnyConditionConfiguration extends AutomationConditionConfiguration {
    readonly plugin: undefined;
    readonly condition: AnyConditionType;

    readonly conditions: AutomationConditionConfiguration[];
}

/**
 * An AutomationCondition that passes if any of it's child conditions passes.
 */
export class AnyCondition extends AutomationCondition {
    readonly config!: AnyConditionConfiguration;

    private conditions: AutomationCondition[] | null = null;

    async load() {
        this.conditions = await Promise.all(this.config.conditions.map((config, index) =>
            this.automations.loadAutomationCondition(config, undefined, this.log.withPrefix('Child #' + index +
                ' (' + ((AutomationCondition as any).id + 1) + ')'))));
    }

    async check(runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_conditions: AutomationCondition[]) {
        this.log.info('Running any condition with runner #%d', runner.id);

        for (const i in this.conditions) { // eslint-disable-line guard-for-in
            const index = parseInt(i);
            const condition = this.conditions[index];

            try {
                this.log.debug('Running condition #%d child #%d', this.id, condition.id);

                let finished = false;

                const result = await condition.check(runner, progress => {
                    if (finished) throw new Error('Cannot update progress after the condition has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.conditions!.length);
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

type AllConditionType = 'Conditional';

export interface AllConditionConfiguration extends AutomationConditionConfiguration {
    readonly plugin: undefined;
    readonly condition: AllConditionType;

    readonly conditions: AutomationConditionConfiguration[];
}

/**
 * An AutomationCondition that passed if all of it's child conditions pass.
 */
export class AllCondition extends AutomationCondition {
    readonly config!: AllConditionConfiguration;

    private conditions: AutomationCondition[] | null = null;

    async load() {
        this.conditions = await Promise.all(this.config.conditions.map((config, index) =>
            this.automations.loadAutomationCondition(config, undefined, this.log.withPrefix('Child #' + index +
                ' (' + ((AutomationCondition as any).id + 1) + ')'))));
    }

    async check(runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_conditions: AutomationCondition[]) {
        this.log('Running all condition with runner #%d', runner.id);

        for (const i in this.conditions) { // eslint-disable-line guard-for-in
            const index = parseInt(i);
            const condition = this.conditions[index];

            try {
                this.log.debug('Running condition #%d child #%d', this.id, condition.id);

                let finished = false;

                const result = await condition.check(runner, progress => {
                    if (finished) throw new Error('Cannot update progress after the condition has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.conditions!.length);
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

type ScriptConditionType = 'Script';

export interface ScriptConditionConfiguration extends AutomationConditionConfiguration {
    readonly plugin: undefined;
    readonly condition: ScriptConditionType;

    readonly script: string | string[];
}

/**
 * An AutomationCondition that runs a JavaScript VM.
 */
export class ScriptCondition extends AutomationCondition {
    readonly config!: ScriptConditionConfiguration;

    private sandbox: {
        server: Server;
        getAccessory: Server['getAccessory'];
        getService: Server['getService'];
        getCharacteristic: Server['getCharacteristic'];
        getCharacteristicValue: Server['getCharacteristicValue'];
        setCharacteristicValue: Server['setCharacteristicValue'];

        automations: Automations;
        automation_condition: ScriptCondition;
        log: Logger;
    } | null = null;
    private script: vm.Script | null = null;

    load() {
        this.sandbox = Object.freeze({
            server: this.automations.server,
            getAccessory: this.automations.server.getAccessory.bind(this.automations.server),
            getService: this.automations.server.getService.bind(this.automations.server),
            getCharacteristic: this.automations.server.getCharacteristic.bind(this.automations.server),
            getCharacteristicValue: this.automations.server.getCharacteristicValue.bind(this.automations.server),
            setCharacteristicValue: this.automations.server.setCharacteristicValue.bind(this.automations.server),

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

    async check(runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_conditions: AutomationCondition[]) {
        this.log.debug('Running script condition #%d', this.id);

        const sandbox = Object.create(this.sandbox!);

        sandbox.automation = runner.automation;
        sandbox.automation_runner = runner;
        sandbox.setAutomationProgress = setProgress;
        sandbox.parent_automation_conditions = parent_conditions;

        Object.freeze(sandbox);

        const sandbox_context = vm.createContext(sandbox);
        return await this.script!.runInContext(sandbox_context);
    }
}

AutomationCondition.types.Script = ScriptCondition;
