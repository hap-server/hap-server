import EventEmitter from 'events';

import AutomationCondition from './condition';
import PluginManager from '../core/plugins';

export default class AutomationAction extends EventEmitter {
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
    constructor(automations, config, uuid, log) {
        super();

        Object.defineProperty(this, 'automations', {value: automations});

        Object.defineProperty(this, 'id', {value: AutomationAction.id++});
        Object.defineProperty(this, 'uuid', {value: uuid});
        Object.defineProperty(this, 'config', {value: config});

        Object.defineProperty(this, 'log', {value: log || automations.log.withPrefix('Action #' + this.id)});
    }

    static load(automations, config, uuid, log) {
        const Action = this.getActionClass(config.action, config.plugin);
        const action = new Action(automations, config, uuid, log);

        action.load();

        return action;
    }

    static getActionClass(type, plugin_name) {
        if (plugin_name) {
            const plugin = PluginManager.getPlugin(plugin_name);

            if (!plugin) throw new Error('Unknown plugin "' + plugin_name + '"');
            if (!plugin.automation_actions.has(type)) throw new Error('Unknown automation action "' + type + // eslint-disable-line curly
                '" from plugin "' + plugin_name + '"');

            return plugin.automation_actions.get(type);
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
     * @param {AutomationRunner} runner
     * @param {function} setProgress
     * @param {AutomationAction} ...parent_actions
     * @return {Promise}
     */
    async run(runner, setProgress) {
        throw new Error('AutomationAction did not override the check function');
    }
}

AutomationAction.id = 0;
AutomationAction.types = {};

/**
 * An AutomationAction that does nothing.
 */
export class TestAction extends AutomationAction {
    async run(runner) {
        this.log('Running test action', runner);

        await new Promise(rs => setTimeout(rs, 1000));
    }
}

AutomationAction.types.test = TestAction;

/**
 * An AutomationAction that runs a condition before running it's child actions.
 */
export class ConditionalAction extends AutomationAction {
    async load() {
        this.condition = await this.automations.loadAutomationCondition(this.config.condition, null,
            this.log.withPrefix('Condition (#' + (AutomationCondition.id + 1) + ')'));
        this.actions = await Promise.all(this.config.actions.map((config, index) =>
            this.automations.loadAutomationAction(config, null, this.log.withPrefix('Child #' + index +
                ' (' + (AutomationAction.id + 1) + ')'))));
    }

    async run(runner, setProgress, ...parent_actions) {
        this.log.debug('Running conditional action #%d condition', this.id);

        let finished = false;

        const result = await this.condition.check(runner, progress => {
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

        await Promise.all(this.actions.map(async (action, index) => {
            try {
                this.log.debug('Running conditional action #%d child #%d', this.id, action.id);

                let finished = false;

                await action.run(runner, progress => {
                    if (finished) throw new Error('Cannot update progress after the action has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.actions.length);
                }, this, ...parent_actions);

                finished = true;
                setProgress((index + 1) / this.actions.length);

                this.log.debug('Finished running conditional action #%d action #%d', this.id, action.id, this);
            } catch (err) {
                this.log.error('Error in conditional action #%d child #%d', this.id, action.id, err);
            }
        }));
    }
}

AutomationAction.types.conditional = ConditionalAction;
