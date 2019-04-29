import EventEmitter from 'events';

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

    /**
     * Runs this action.
     *
     * @param {TriggerEvent} event
     * @return {Promise}
     */
    async run(event) {
        throw new Error('AutomationAction did not override the check function');
    }
}

AutomationAction.id = 0;
AutomationAction.types = {};

/**
 * An AutomationAction that does nothing.
 */
export class TestAction extends AutomationAction {
    run(event) {
        this.log('Running test action', event);
    }
}

AutomationAction.types.test = TestAction;
