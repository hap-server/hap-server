import AutomationTrigger from './trigger';
import AutomationCondition from './condition';
import AutomationAction from './action';

export default class Automations {
    /**
     * Creates an Automations group.
     *
     * @param {Server} server
     * @param {Logger} [log]
     */
    constructor(server, log) {
        this.server = server;
        this.log = log || this.server.log.withPrefix('Automations');

        this.automations = [];
    }

    /**
     * Start running automations.
     */
    start() {
        this.running = true;

        return Promise.all(this.automations.map(a => Promise.all(a.triggers.map(t => t.start()))));
    }

    /**
     * Stop running automations.
     */
    stop() {
        this.running = false;

        return Promise.all(this.automations.map(a => Promise.all(a.triggers.map(t => t.stop()))));
    }

    /**
     * Loads an automation.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @return {Automation}
     */
    async loadAutomation(config, uuid) {
        const automation = new Automation(this, config, uuid);

        this.addAutomation(automation);

        return automation;
    }

    /**
     * Adds an automation.
     *
     * @param {Automation} automation
     */
    addAutomation(...automations) {
        for (const automation of automations) {
            if (automation.automations !== this) {
                throw new Error('Cannot add an automation from a different automations group');
            }

            this.automations.push(automation);

            if (this.running) {
                for (const trigger of automation.triggers) {
                    trigger.start();
                }
            }
        }
    }

    /**
     * Removes an automation.
     *
     * @param {Automation} automation
     */
    removeAutomation(...automations) {
        for (const automation of automations) {
            let index;
            while ((index = this.automations.indexOf(automation)) > -1) this.automations.splice(index, 1);

            try {
                for (const trigger of automation.triggers) {
                    if (this.automations.find(a => a.triggers.find(t => t === trigger))) trigger.stop();
                }
            } catch (err) {
                this.automations.push(automation);
                throw err;
            }
        }
    }

    /**
     * Gets an Automation.
     *
     * @param {number} id
     * @return {Automation}
     */
    getAutomation(id) {
        return this.automations.find(automation => automation.id === id);
    }

    /**
     * Gets an Automation by it's UUID.
     *
     * @param {string} uuid
     * @return {Automation}
     */
    getAutomationByUUID(uuid) {
        return this.automations.find(automation => automation.uuid === uuid);
    }

    /**
     * Loads an automation trigger.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     * @return {Promise<AutomationTrigger>}
     */
    async loadAutomationTrigger(config, uuid, log) {
        return AutomationTrigger.load(this, config, uuid, log);
    }

    /**
     * Loads an automation condition.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     * @return {Promise<AutomationCondition>}
     */
    async loadAutomationCondition(config, uuid, log) {
        return AutomationCondition.load(this, config, uuid, log);
    }

    /**
     * Loads an automation action.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     * @return {Promise<AutomationAction>}
     */
    async loadAutomationAction(config, uuid, log) {
        return AutomationAction.load(this, config, uuid, log);
    }

    /**
     * Handle a characteristic update.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @param {Characteristic} characteristic
     * @param {} value
     * @param {} old_value
     * @param {object} context
     */
    handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context) {
        //
    }
}

export class Automation {
    /**
     * Creates an Automation.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     */
    constructor(automations, config, uuid) {
        Object.defineProperty(this, 'automations', {value: automations});
        Object.defineProperty(this, 'id', {value: Automation.id++});
        Object.defineProperty(this, 'uuid', {value: uuid});
        this.config = config;

        this.log = automations.log.withPrefix('Automation #' + this.id);

        this.triggers = [];
        this.conditions = [];
        this.actions = [];

        this.handleTrigger = this.handleTrigger.bind(this);
    }

    /**
     * Handles an event from a trigger.
     *
     * @param {TriggerEvent} event
     * @return {Promise}
     */
    async handleTrigger(event) {
        this.log.info('Received automation trigger event', event);

        for (const condition of this.conditions) {
            try {
                this.log.debug('Running automation #%d condition #%d', this.id, condition.id);
                const result = await condition.check(event);

                if (!result) {
                    this.log.info('Not running automation #%d as condition #%d failed', this.id, condition.id);
                    return;
                }

                this.log.info('Automation #%d condition #%d passed', this.id, condition.id);
            } catch (err) {
                this.log.error('Error in automation condition', err);
                return;
            }
        }

        await Promise.all(this.actions.map(async action => {
            try {
                this.log.debug('Running automation #%d action #%d', this.id, action.id);
                await action.run(event);
                this.log.debug('Finished running automation #%d action #%d', this.id, action.id);
            } catch (err) {
                this.log.error('Error in automation action', err);
            }
        }));
    }

    /**
     * Adds a trigger.
     *
     * @param {AutomationTrigger} trigger
     */
    addTrigger(...triggers) {
        for (const trigger of triggers) {
            if (trigger.automations !== this.automations) {
                throw new Error('Cannot add a trigger from a different automations group');
            }

            trigger.on('trigger', this.handleTrigger);
            this.triggers.push(trigger);

            if (this.automations.running && this.automations.automations.find(a => a === this)) trigger.start();
        }
    }

    /**
     * Removes a trigger.
     *
     * @param {AutomationTrigger} trigger
     */
    removeTrigger(...triggers) {
        for (const trigger of triggers) {
            trigger.removeListener('trigger', this.handleTrigger);
            this.triggers.splice(this.triggers.indexOf(trigger), 1);

            try {
                if (!trigger.automations.automations.find(a => a.triggers.find(t => t === trigger))) trigger.stop();
            } catch (err) {
                this.triggers.push(automation);
                throw err;
            }
        }
    }

    /**
     * Adds a condition.
     *
     * @param {AutomationCondition} condition
     */
    addCondition(...conditions) {
        for (const condition of conditions) {
            if (condition.automations !== this.automations) {
                throw new Error('Cannot add a condition from a different automations group');
            }

            this.conditions.push(condition);
        }
    }

    /**
     * Removes a condition.
     *
     * @param {AutomationCondition} condition
     */
    removeCondition(...condition) {
        for (const condition of condition) {
            let index;
            while ((index = this.conditions.indexOf(condition)) > -1) this.conditions.splice(index, 1);
        }
    }

    /**
     * Adds an action.
     *
     * @param {AutomationAction} action
     */
    addAction(...actions) {
        for (const action of actions) {
            if (action.automations !== this.automations) {
                throw new Error('Cannot add an action from a different automations group');
            }

            this.actions.push(action);
        }
    }

    /**
     * Removes an action.
     *
     * @param {AutomationAction} action
     */
    removeAction(...actions) {
        for (const action of actions) {
            let index;
            while ((index = this.actions.indexOf(action)) > -1) this.actions.splice(index, 1);
        }
    }
}

Automation.id = 0;
