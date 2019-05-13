import EventEmitter from 'events';

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
     *
     * @return {Promise}
     */
    start() {
        this.running = true;

        return Promise.all(this.automations.map(a => Promise.all(a.triggers.map(t => t.start()))));
    }

    /**
     * Stop running automations.
     *
     * @return {Promise}
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
     * @return {Promise<Automation>}
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
     * @return {Promise}
     */
    async addAutomation(...automations) {
        for (const automation of automations) {
            this.log.debug('Adding automation', automation);

            if (automation.automations !== this) {
                throw new Error('Cannot add an automation from a different automations group');
            }

            if (this.automations.includes(automation)) continue;

            if (automation.uuid && this.automations.find(a => a.uuid === automation.uuid)) {
                throw new Error('There is already an automation with this UUID');
            }

            this.automations.push(automation);

            if (this.running) {
                for (const trigger of automation.triggers) {
                    await trigger.start();
                }
            }
        }
    }

    /**
     * Removes an automation.
     *
     * @param {Automation} automation
     * @return {Promise}
     */
    async removeAutomation(...automations) {
        for (const automation of automations) {
            this.log.debug('Removing automation', automation);

            let index;
            while ((index = this.automations.indexOf(automation)) > -1) this.automations.splice(index, 1);

            try {
                for (const trigger of automation.triggers) {
                    if (this.automations.find(a => a.triggers.find(t => t === trigger))) await trigger.stop();
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
     * @param {*} value
     * @param {*} old_value
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

        this.running = [];

        this.handleTrigger = this.handleTrigger.bind(this);
    }

    /**
     * Handles an event from a trigger.
     *
     * @param {TriggerEvent} event
     */
    handleTrigger(event) {
        this.log.info('Received automation trigger event', event);

        const runner = new AutomationRunner(this, event);

        this.running.push(runner);

        runner.on('finished', () => this.running.splice(this.running.indexOf(runner), 1));

        runner.run();
    }

    /**
     * Adds a trigger.
     *
     * @param {AutomationTrigger} trigger
     * @return {Promise}
     */
    async addTrigger(...triggers) {
        for (const trigger of triggers) {
            if (trigger.automations !== this.automations) {
                throw new Error('Cannot add a trigger from a different automations group');
            }

            if (this.triggers.includes(trigger)) continue;

            if (trigger.uuid && this.triggers.find(t => t.uuid === trigger.uuid)) {
                throw new Error('There is already a trigger with this UUID');
            }

            trigger.on('trigger', this.handleTrigger);
            this.triggers.push(trigger);

            if (this.automations.running && this.automations.automations.find(a => a === this)) await trigger.start();
        }
    }

    /**
     * Removes a trigger.
     *
     * @param {AutomationTrigger} trigger
     * @return {Promise}
     */
    async removeTrigger(...triggers) {
        for (const trigger of triggers) {
            trigger.removeListener('trigger', this.handleTrigger);
            this.triggers.splice(this.triggers.indexOf(trigger), 1);

            try {
                if (!trigger.automations.automations.find(a => a.triggers.find(t => t === trigger))) {
                    await trigger.stop();
                }
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

            if (this.conditions.includes(condition)) continue;

            if (condition.uuid && this.conditions.find(c => c.uuid === condition.uuid)) {
                throw new Error('There is already a condition with this UUID');
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

            if (this.actions.includes(action)) continue;

            if (action.uuid && this.actions.find(a => a.uuid === action.uuid)) {
                throw new Error('There is already an action with this UUID');
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

export class AutomationRunner extends EventEmitter {
    /**
     * Creates an AutomationRunner.
     *
     * @param {Automation} automation
     * @param {TriggerEvent} event
     */
    constructor(automation, event) {
        super();

        Object.defineProperty(this, 'automation', {value: automation});
        Object.defineProperty(this, 'id', {value: Automation.id++});
        Object.defineProperty(this, 'event', {enumerable: true, value: event});

        Object.defineProperty(this, 'log', {value: automation.log.withPrefix('Runner #' + this.id)});

        Object.defineProperty(this, 'conditions', {value: new Map(automation.conditions.map(c => [c, 0]))});
        Object.defineProperty(this, 'actions', {value: new Map(automation.actions.map(a => [a, 0]))});

        this.running = null;
        this.finished = false;
    }

    /**
     * @return {number} 0-1
     */
    get progress() {
        return this.finished ? 1 : [...this.conditions.values(), ...this.actions.values()]
            .reduce((cur, acc) => acc + cur) / (this.conditions.size + this.actions.size);
    }

    get conditions_progress() {
        return this.finished ? 1 : [...this.conditions.values()].reduce((cur, acc) => acc + cur) / this.conditions.size;
    }

    get actions_progress() {
        return this.finished ? 1 : [...this.actions.values()].reduce((cur, acc) => acc + cur) / this.actions.size;
    }

    /**
     * Run an automation.
     *
     * @return {Promise}
     */
    run() {
        if (this.running) return this.running;

        return this.running = this._run();
    }

    async _run() {
        if (this.running) return;
        if (this.finished) throw new Error('This automation has already run');

        this.log.info('Running automation #%d', this.automation.id);
        this.emit('running');

        for (const condition of this.conditions.keys()) {
            try {
                this.log.debug('Running automation #%d condition #%d', this.automation.id, condition.id);

                let finished = false;

                const result = await condition.check(this, progress => {
                    if (finished) throw new Error('Cannot update progress after the condition has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    this.conditions.set(condition, progress);
                    this.emit('condition-progress', condition, progress);
                    this.emit('conditions-progress', this.conditions_progress);
                    this.emit('progress', this.progress);
                });

                finished = true;

                this.conditions.set(condition, 1);
                this.emit('condition-progress', condition, 1);
                this.emit('conditions-progress', this.conditions_progress);
                this.emit('progress', this.progress);
                this.emit('condition-finished', condition, result);

                if (!result) {
                    this.log.info('Not running automation #%d as condition #%d failed',
                        this.automation.id, condition.id);
                    this.emit('condition-failed', condition);
                    this.finished = true;
                    this.emit('finished', false);
                    return;
                }

                this.log.debug('Automation #%d condition #%d passed', this.automation.id, condition.id);
                this.emit('condition-passed', condition);
            } catch (err) {
                this.log.error('Error in automation condition', err);
                this.emit('condition-error', condition, err);
                this.emit('condition-failed', condition, err);

                this.finished = true;
                this.emit('error', err);
                this.emit('finished', false);
                throw err;
            }
        }

        await Promise.all([...this.actions.keys()].map(async action => {
            try {
                this.log.debug('Running automation #%d action #%d', this.automation.id, action.id, this);

                let finished = false;

                const result = await action.run(this, progress => {
                    if (finished) throw new Error('Cannot update progress after the action has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    this.actions.set(action, progress);
                    this.emit('action-progress', action, progress);
                    this.emit('actions-progress', this.actions_progress);
                    this.emit('progress', this.progress);
                });

                finished = true;
                this.actions.set(action, 1);
                this.emit('action-progress', action, 1);
                this.emit('action-finished', action, result);
                this.emit('actions-progress', this.actions_progress);
                this.emit('progress', this.progress);

                this.log.debug('Finished running automation #%d action #%d', this.automation.id, action.id, this);
            } catch (err) {
                this.log.error('Error in automation action', err);
                this.emit('action-error', action, err);
            }
        }));

        this.finished = true;
        this.emit('finished', true);
    }
}

AutomationRunner.id = 0;
