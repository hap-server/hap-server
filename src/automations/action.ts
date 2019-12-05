import {AutomationTriggerEvent} from '../events/server';
import {AutomationRunner} from '.';
import AutomationCondition from './condition';
import PluginManager from '../server/plugins';

import EventEmitter from 'events';
import vm from 'vm';

import Server from '../server/server';
import Automations from '.';
import Scene from './scene';
import Logger from '../common/logger';
import {Accessory, Service, Characteristic} from 'hap-nodejs';
import {AutomationActionConfiguration, AutomationConditionConfiguration} from '../cli/configuration';

export default class AutomationAction extends EventEmitter {
    private static id = 0;
    static readonly types: {
        [key: string]: typeof AutomationAction;
    } = {};

    readonly automations!: Automations;
    readonly id!: number;
    readonly uuid!: string | null;
    readonly config: any;
    readonly log!: Logger;

    /**
     * Creates an AutomationAction.
     *
     * Automation actions should override the run function.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     */
    constructor(automations: Automations, config: any, uuid?: string, log?: Logger) {
        super();

        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationAction.id++});
        Object.defineProperty(this, 'uuid', {value: uuid || null});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: log || automations.log.withPrefix('Action #' + this.id)});
    }

    static load(automations: Automations, config: any, uuid?: string, log?: Logger): AutomationAction {
        const Action = this.getActionClass(config.action, config.plugin);
        const action = new Action(automations, config, uuid, log);

        action.load();

        return action;
    }

    static getActionClass(type: string, plugin_name: string): typeof AutomationAction {
        if (plugin_name) {
            const plugin = PluginManager.getPlugin(plugin_name);

            if (!plugin) throw new Error('Unknown plugin "' + plugin_name + '"');
            if (!plugin.automation_actions.has(type)) throw new Error('Unknown automation action "' + type + // eslint-disable-line curly
                '" from plugin "' + plugin_name + '"');

            return plugin.automation_actions.get(type)!;
        }

        const Action = AutomationAction.types[type];
        if (!Action) throw new Error('Unknown automation action "' + type + '"');

        return Action;
    }

    load() {
        //
    }

    /**
     * Runs this action.
     *
     * @param {(AutomationRunner|Scene)} runner
     * @param {function} setProgress
     * @param {AutomationAction} ...parent_actions
     * @return {Promise}
     */
    async run(runner: AutomationRunner | Scene, setProgress: (progress: number) => void, ...parent_actions: AutomationAction[]): Promise<boolean | void> {
        throw new Error('AutomationAction did not override the check function');
    }
}

/**
 * An AutomationAction that does nothing.
 */
export class TestAction extends AutomationAction {
    async run(runner: AutomationRunner) {
        this.log('Running test action with runner #%d', runner.id);

        await new Promise(rs => setTimeout(rs, 1000));
    }
}

AutomationAction.types.Test = TestAction;

type ConditionalActionType = 'Conditional';

export interface ConditionalActionConfiguration extends AutomationActionConfiguration {
    readonly plugin: undefined;
    readonly action: ConditionalActionType;

    readonly condition: AutomationConditionConfiguration;
    readonly actions: AutomationActionConfiguration[];
}

/**
 * An AutomationAction that runs a condition before running it's child actions.
 */
export class ConditionalAction extends AutomationAction {
    readonly config!: ConditionalActionConfiguration;

    private condition: AutomationCondition | null = null;
    private actions: AutomationAction[] | null = null;

    async load() {
        this.condition = await this.automations.loadAutomationCondition(this.config.condition, undefined,
            this.log.withPrefix('Condition (#' + ((AutomationCondition as any).id + 1) + ')'));
        this.actions = await Promise.all(this.config.actions.map((config, index) =>
            this.automations.loadAutomationAction(config, undefined, this.log.withPrefix('Child #' + index +
                ' (' + ((AutomationAction as any).id + 1) + ')'))));
    }

    async run(runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_actions: AutomationAction[]) {
        this.log.debug('Running conditional action #%d condition', this.id);

        let finished = false;

        const result = await this.condition!.check(runner, progress => {
            if (finished) throw new Error('Cannot update progress after the condition has finished running');
            if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
            setProgress(progress / 2);
        });

        finished = true;
        setProgress(0.5);

        if (!result) {
            this.log.debug('Not running conditional action #%d as condition failed', this.id);
            return false;
        }

        this.log.debug('Conditional action #%d condition passed', this.id);

        await Promise.all(this.actions!.map(async (action, index) => {
            try {
                this.log.debug('Running conditional action #%d child #%d', this.id, action.id);

                let finished = false;

                await action.run(runner, progress => {
                    if (finished) throw new Error('Cannot update progress after the action has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.actions!.length);
                }, this, ...parent_actions);

                finished = true;
                setProgress((index + 1) / this.actions!.length);

                this.log.debug('Finished running conditional action #%d action #%d', this.id, action.id, this);
            } catch (err) {
                this.log.error('Error in conditional action #%d child #%d', this.id, action.id, err);
            }
        }));
    }
}

AutomationAction.types.Conditional = ConditionalAction;

type ScriptActionType = 'Script';

export interface ScriptActionConfiguration extends AutomationActionConfiguration {
    readonly plugin: undefined;
    readonly action: ScriptActionType;

    readonly script: string | string[];
}

/**
 * An AutomationAction that runs a JavaScript VM.
 */
export class ScriptAction extends AutomationAction {
    readonly config!: ScriptActionConfiguration;

    private sandbox: {
        server: Server;
        getAccessory: Server['getAccessory'];
        getService: Server['getService'];
        getCharacteristic: Server['getCharacteristic'];
        getCharacteristicValue: Server['getCharacteristicValue'];
        setCharacteristicValue: Server['setCharacteristicValue'];

        automations: Automations;
        automation_action: ScriptAction;
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
            automation_action: this,
            log: this.log.withPrefix('Script'),
        });

        this.script = new vm.Script(
            '(async function () { ' +
            (this.config.script instanceof Array ? this.config.script.join('\n') : this.config.script) +
            '\n})()'
        );
    }

    async run(runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_actions: AutomationAction[]) {
        this.log.debug('Running script action #%d', this.id);

        const sandbox = Object.create(this.sandbox!);

        sandbox.automation_runner = runner;
        sandbox.setAutomationProgress = setProgress;
        sandbox.parent_automation_actions = parent_actions;

        Object.freeze(sandbox);

        const sandbox_context = vm.createContext(sandbox);
        return await this.script!.runInContext(sandbox_context);
    }
}

AutomationAction.types.Script = ScriptAction;

type SetCharacteristicActionType = 'SetCharacteristic';

interface BaseSetCharacteristicActionConfiguration extends AutomationActionConfiguration {
    readonly plugin: undefined;
    readonly action: SetCharacteristicActionType;

    readonly characteristic: string | string[];
}

export type SetCharacteristicActionConfiguration =
    (BaseSetCharacteristicActionConfiguration & {value: any}) |
    (BaseSetCharacteristicActionConfiguration & {increase: number}) |
    (BaseSetCharacteristicActionConfiguration & {decrease: number});

/**
 * An AutomationAction that sets a characteristic.
 */
export class SetCharacteristicAction extends AutomationAction {
    readonly config!: SetCharacteristicActionConfiguration;

    async run(runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_actions: AutomationAction[]) {
        const characteristic = this.automations.server.getCharacteristic(this.config.characteristic);

        if (!characteristic) throw new Error('Unknown characteristic "' + this.config.characteristic + '"');

        if (typeof this.config.value !== 'undefined') {
            this.log.debug('Setting characteristic "%s" to "%s"', this.config.characteristic, this.config.value);

            await characteristic.setValue(this.config.value);
        } else if (typeof this.config.increase !== 'undefined') {
            this.log.debug('Increasing characteristic "%s" by "%s"', this.config.characteristic, this.config.increase);

            await characteristic.setValue(characteristic.value + this.config.increase);
        } else if (typeof this.config.decrease !== 'undefined') {
            this.log.debug('Decreasing characteristic "%s" by "%s"', this.config.characteristic, this.config.decrease);

            await characteristic.setValue(characteristic.value - this.config.decrease);
        } else {
            throw new Error('Invalid action');
        }
    }
}

AutomationAction.types.SetCharacteristic = SetCharacteristicAction;

type RunAutomationActionType = 'Script';

export interface RunAutomationActionConfiguration extends AutomationActionConfiguration {
    readonly plugin: undefined;
    readonly action: RunAutomationActionType;

    readonly automation_uuid: string;
    readonly skip_conditions?: boolean;
}

/**
 * An AutomationAction that triggers an automation.
 */
export class RunAutomationAction extends AutomationAction {
    readonly config!: RunAutomationActionConfiguration;

    async run(parent_runner: AutomationRunner, setProgress: (progress: number) => void, ...parent_actions: AutomationAction[]) {
        const automation = this.automations.getAutomationByUUID(this.config.automation_uuid);
        if (!automation) return;

        const event = new AutomationTriggerEvent(this, {
            action: this,
            parent_runner,
        });
        // automation.emit(event, this, event.context, true);

        const conditions = automation.conditions;
        if (this.config.skip_conditions) (automation as any).conditions = [];

        const runner = new AutomationRunner(automation, event);
        automation.running.push(runner);
        runner.on('finished', () => automation.running.splice(automation.running.indexOf(runner), 1));
        runner.on('progress', progress => setProgress(progress));

        (automation as any).conditions = conditions;

        await runner.run();
    }
}

AutomationAction.types.RunAutomation = RunAutomationAction;
