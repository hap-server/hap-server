import AutomationTrigger from './trigger';

export default class Automations {
    /**
     * Creates an Automations object.
     *
     * @param {Server} server
     * @param {Logger} [log]
     */
    constructor(server, log) {
        this.server = server;
        this.log = log || this.server.log.withPrefix('Automations');

        this.automations = [];
        this.triggers = new Set();
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
     * Loads an automation.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @return {Promise<AutomationTrigger>}
     */
    async loadAutomationTrigger(config, uuid) {
        return AutomationTrigger.load(this, config, uuid);
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
        this.log.info('Received automation trigger event', this, this.id, event);

        for (const condition of this.conditions) {
            try {
                const result = await condition.check(event);

                if (!result) {
                    this.log.info('Not running automation #%n as condition #%n failed', this.id, condition.id);
                    return;
                }
            } catch (err) {
                this.log.error('Error in automation condition', err);
                return;
            }
        }

        await Promise.all(this.actions.map(async action => {
            try {
                this.log.debug('Running automation #%n action #%n', this.id, action.id);
                await action.run(event);
                this.log.debug('Finished running automation #%n action #%n', this.id, action.id);
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

            let index;
            while ((index = this.triggers.indexOf(trigger)) > -1) this.triggers.splice(index, 1);

            try {
                if (!trigger.automations.automations.find(a => a.triggers.find(t => t === trigger))) trigger.stop();
            } catch (err) {
                this.triggers.push(automation);
                throw err;
            }
        }
    }
}

Automation.id = 0;
