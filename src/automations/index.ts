import EventEmitter from 'events';

import Events from '../events';
import {AutomationTriggerEvent, AutomationRunningEvent} from '../events/server';
import AutomationTrigger from './trigger';
import AutomationCondition from './condition';
import AutomationAction from './action';
import Scene from './scene';

import Server from '../server/server';
import Logger from '../common/logger';

export default class Automations extends Events {
    readonly server: Server;
    readonly log: Logger;

    readonly automations: Automation[];
    readonly scenes: Scene[];
    readonly runners: {[key: number]: AutomationRunner};

    running = false;

    /**
     * Creates an Automations group.
     *
     * @param {Server} server
     * @param {Logger} [log]
     */
    constructor(server: Server, log?: Logger) {
        super();
        this.parent_emitter = server;

        this.server = server;
        this.log = log || this.server.log.withPrefix('Automations');

        this.automations = [];
        this.scenes = [];
        this.runners = {};
    }

    /**
     * Start running automations.
     *
     * @return {Promise}
     */
    async start(): Promise<void> {
        this.running = true;

        await Promise.all(this.automations.map(a => Promise.all(a.triggers.map(t => t.start()))));
    }

    /**
     * Stop running automations.
     *
     * @return {Promise}
     */
    async stop(): Promise<void> {
        this.running = false;

        await Promise.all(this.automations.map(a => Promise.all(a.triggers.map(t => t.stop()))));
    }

    /**
     * Loads an automation.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @return {Promise<Automation>}
     */
    async loadAutomation(config: any, uuid?: string): Promise<Automation> {
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
    async addAutomation(...automations: Automation[]): Promise<void> {
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
    async removeAutomation(...automations: Automation[]): Promise<void> {
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
     * Loads a scene.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @return {Promise<Scene>}
     */
    async loadScene(config: any, uuid?: string): Promise<Scene> {
        const scene = new Scene(this, config, uuid);

        this.addScene(scene);

        return scene;
    }

    /**
     * Adds a scene.
     *
     * @param {Scene} scene
     * @return {Promise}
     */
    async addScene(...scenes: Scene[]): Promise<void> {
        for (const scene of scenes) {
            this.log.debug('Adding scene', scene);

            if (scene.automations !== this) {
                throw new Error('Cannot add a scene from a different automations group');
            }

            if (this.scenes.includes(scene)) continue;

            if (scene.uuid && this.scenes.find(s => s.uuid === scene.uuid)) {
                throw new Error('There is already a scene with this UUID');
            }

            this.scenes.push(scene);
        }
    }

    /**
     * Removes a scene.
     *
     * @param {Scene} scene
     * @return {Promise}
     */
    async removeScene(...scenes: Scene[]): Promise<void> {
        for (const scene of scenes) {
            this.log.debug('Removing scene', scene);

            let index;
            while ((index = this.scenes.indexOf(scene)) > -1) this.scenes.splice(index, 1);
        }
    }

    /**
     * Gets an Automation.
     *
     * @param {number} id
     * @return {Automation}
     */
    getAutomation(id: number): Automation | null {
        return this.automations.find(automation => automation.id === id) || null;
    }

    /**
     * Gets an Automation by it's UUID.
     *
     * @param {string} uuid
     * @return {Automation}
     */
    getAutomationByUUID(uuid: string): Automation | null {
        return this.automations.find(automation => automation.uuid === uuid) || null;
    }

    /**
     * Gets a Scene.
     *
     * @param {number} id
     * @return {Scene}
     */
    getScene(id: number): Scene | null {
        return this.scenes.find(scene => scene.id === id) || null;
    }

    /**
     * Gets a Scene by it's UUID.
     *
     * @param {string} uuid
     * @return {Scene}
     */
    getSceneByUUID(uuid: string): Scene | null {
        return this.scenes.find(scene => scene.uuid === uuid) || null;
    }

    /**
     * Loads an automation trigger.
     *
     * @param {object} config
     * @param {string} [uuid]
     * @param {Logger} [log]
     * @return {Promise<AutomationTrigger>}
     */
    async loadAutomationTrigger(config: any, uuid?: string, log?: Logger): Promise<AutomationTrigger> {
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
    async loadAutomationCondition(config: any, uuid?: string, log?: Logger): Promise<AutomationCondition> {
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
    async loadAutomationAction(config: any, uuid?: string, log?: Logger): Promise<AutomationAction> {
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
    handleCharacteristicUpdate(
        accessory: HAPNodeJS.Accessory, service: HAPNodeJS.Service,
        characteristic: HAPNodeJS.Characteristic, value: any, old_value: any, context: any
    ) {
        //
    }
}

export class Automation {
    private static id = 0;

    readonly automations: Automations;
    readonly id: number;
    readonly uuid: string | null;
    readonly config?: any;

    readonly log: Logger;
    readonly triggers: AutomationTrigger[];
    readonly conditions: AutomationCondition[];
    readonly actions: AutomationAction[];
    readonly running: AutomationRunner[];

    /**
     * Creates an Automation.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     */
    constructor(automations: Automations, config: any, uuid?: string) {
        Object.defineProperty(this, 'automations', {value: automations});
        Object.defineProperty(this, 'id', {value: Automation.id++});
        Object.defineProperty(this, 'uuid', {value: uuid || null});
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
     * @param {boolean} dont_run
     */
    handleTrigger(event: AutomationTriggerEvent, dont_run?: boolean) {
        if (dont_run) return;

        this.log.info('Received automation trigger event', event);

        const runner = new AutomationRunner(this, event);

        this.running.push(runner);
        this.automations.runners[runner.id] = runner;

        runner.on('finished', () => {
            this.running.splice(this.running.indexOf(runner), 1);
            delete this.automations.runners[runner.id];
        });

        runner.run();
    }

    /**
     * Adds a trigger.
     *
     * @param {AutomationTrigger} trigger
     * @return {Promise}
     */
    async addTrigger(...triggers: AutomationTrigger[]): Promise<void> {
        for (const trigger of triggers) {
            if (trigger.automations !== this.automations) {
                throw new Error('Cannot add a trigger from a different automations group');
            }

            if (this.triggers.includes(trigger)) continue;

            if (trigger.uuid && this.triggers.find(t => t.uuid === trigger.uuid)) {
                throw new Error('There is already a trigger with this UUID');
            }

            trigger.on(AutomationTriggerEvent, this.handleTrigger);
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
    async removeTrigger(...triggers: AutomationTrigger[]): Promise<void> {
        for (const trigger of triggers) {
            trigger.removeListener('trigger', this.handleTrigger);
            this.triggers.splice(this.triggers.indexOf(trigger), 1);

            try {
                if (!trigger.automations.automations.find(a => a.triggers.find(t => t === trigger))) {
                    await trigger.stop();
                }
            } catch (err) {
                this.triggers.push(trigger);
                throw err;
            }
        }
    }

    /**
     * Adds a condition.
     *
     * @param {AutomationCondition} condition
     */
    addCondition(...conditions: AutomationCondition[]) {
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
    removeCondition(...conditions: AutomationCondition[]) {
        for (const condition of conditions) {
            let index;
            while ((index = this.conditions.indexOf(condition)) > -1) this.conditions.splice(index, 1);
        }
    }

    /**
     * Adds an action.
     *
     * @param {AutomationAction} action
     */
    addAction(...actions: AutomationAction[]) {
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
    removeAction(...actions: AutomationAction[]) {
        for (const action of actions) {
            let index;
            while ((index = this.actions.indexOf(action)) > -1) this.actions.splice(index, 1);
        }
    }
}

export class AutomationRunner extends EventEmitter {
    private static id = 0;

    readonly automation: Automation;
    readonly id: number;
    readonly event: AutomationTriggerEvent;
    readonly log: Logger;
    readonly conditions: Map<AutomationCondition, number>;
    readonly actions: Map<AutomationAction, number>;

    private running: Promise<void> | null = null;
    private finished = false;

    /**
     * Creates an AutomationRunner.
     *
     * @param {Automation} automation
     * @param {TriggerEvent} event
     */
    constructor(automation: Automation, event: AutomationTriggerEvent) {
        super();

        Object.defineProperty(this, 'automation', {value: automation});
        Object.defineProperty(this, 'id', {value: AutomationRunner.id++});
        Object.defineProperty(this, 'event', {enumerable: true, value: event});

        Object.defineProperty(this, 'log', {value: automation.log.withPrefix('Runner #' + this.id)});

        Object.defineProperty(this, 'conditions', {value: new Map(automation.conditions.map(c => [c, 0]))});
        Object.defineProperty(this, 'actions', {value: new Map(automation.actions.map(a => [a, 0]))});
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

        this.automation.automations.emit(AutomationRunningEvent, this);

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
                    if (progress === this.actions.get(action)) return;
                    this.log.debug('Action #%d progress %d', action.id, progress);
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
