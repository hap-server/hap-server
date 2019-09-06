import Events from '../events';
import {
    SceneTriggerEvent, SceneActivateProgressEvent, SceneActivatedEvent, SceneDeactivateProgressEvent,
    SceneDeactivatedEvent,
} from '../events/server';

import Automations from '.';
import AutomationCondition from './condition';
import AutomationAction from './action';
import Logger from '../common/logger';

export default class Scene extends Events {
    private static id = 0;

    readonly automations: Automations;
    readonly id: number;
    readonly uuid?: string;
    readonly config;
    readonly log: Logger;

    readonly conditions: AutomationCondition[];
    readonly enable_actions: AutomationAction[];
    readonly disable_actions: AutomationAction[];

    private _active: Promise<boolean>;
    private check_active_progress: number;
    private last_active: boolean;
    private last_active_time: number;

    private _enabling: Promise<void>;
    private enable_progress: number;

    private _disabling: Promise<void>;
    private disable_progress: number;

    /**
     * Creates a Scene.
     *
     * @param {Automations} automations
     * @param {object} config
     * @param {string} [uuid]
     */
    constructor(automations: Automations, config?, uuid?: string) {
        super();

        this.parent_emitter = automations;

        Object.defineProperty(this, 'automations', {value: automations});
        Object.defineProperty(this, 'id', {value: Scene.id++});
        Object.defineProperty(this, 'uuid', {value: uuid});
        this.config = config;

        this.log = automations.log.withPrefix('Scene #' + this.id);

        this.conditions = [];
        this.enable_actions = [];
        this.disable_actions = [];
    }

    /**
     * Checks if the scene is active.
     * Usually means checking accessories.
     *
     * @return {Promise<boolean>}
     */
    get active(): Promise<boolean> {
        if (this._active) return this._active;

        this.emit('checking-active');
        this.check_active_progress = 0;

        return this._active = this._checkActive(progress => {
            this.emit('check-active-progress', progress);
            this.check_active_progress = progress;
        }).then(is_active => {
            if (this.last_active !== is_active) {
                this.emit(is_active ? SceneActivatedEvent : SceneDeactivatedEvent, this);
            }

            this.last_active = is_active;
            this.last_active_time = Date.now();

            this.emit('check-active-finished');
            this._active = null;
            this.check_active_progress = 1;
            return is_active;
        }, err => {
            this._active = null;
            this.check_active_progress = 0;
            throw err;
        });
    }

    private async _checkActive(setProgress) {
        this.log.info('Checking if scene is active');

        for (let i in this.conditions) { // eslint-disable-line guard-for-in
            const index = parseInt(i);
            const condition = this.conditions[index];

            try {
                this.log.debug('Running scene #%d active condition #%d', this.id, condition.id);

                let finished = false;

                const result = await condition.check(this, progress => {
                    if (finished) throw new Error('Cannot update progress after the condition has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.conditions.length);
                });

                finished = true;
                setProgress((index + 1) / this.conditions.length);

                if (!result) {
                    this.log.debug('Scene #%d not active as child #%d failed', this.id, condition.id);
                    return false;
                }

                this.log.debug('Scene #%d active condition #%d passed', this.id, condition.id);
            } catch (err) {
                this.log.error('Error in scene active condition', err);
                throw err;
            }
        }

        return true;
    }

    /**
     * Adds an active condition.
     *
     * @param {AutomationCondition} condition
     */
    addActiveCondition(...conditions: AutomationCondition[]) {
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
     * Removes an active condition.
     *
     * @param {AutomationCondition} condition
     */
    removeActiveCondition(...conditions: AutomationCondition[]) {
        for (const condition of conditions) {
            let index;
            while ((index = this.conditions.indexOf(condition)) > -1) this.conditions.splice(index, 1);
        }
    }

    /**
     * Enables this scene.
     *
     * @param {object} [context]
     * @return {Promise}
     */
    enable(context?): Promise<void> {
        const trigger_event = new SceneTriggerEvent(this, true, context || {});
        this.emit(trigger_event, true, trigger_event.context);

        if (this._enabling) return this._enabling;

        this.enable_progress = 0;

        return this._enabling = (this._disabling || Promise.resolve()).then(() => {
            this.emit('enabling');
        }).then(() => this._enable(progress => {
            this.emit(SceneActivateProgressEvent, this, trigger_event, progress);
            this.emit('enable-progress', progress);
            this.enable_progress = progress;
        })).then(() => {
            this.emit(SceneActivatedEvent, this, trigger_event);
            this.emit('enable-finished');
            this._enabling = null;
            this.enable_progress = 1;
        }, err => {
            this.emit('enable-error', err);
            this._enabling = null;
            this.enable_progress = 0;
            throw err;
        });
    }

    private async _enable(setProgress) {
        await Promise.all(this.enable_actions.map(async (action, index) => {
            try {
                this.log.debug('Running scene #%d enable action #%d', this.id, action.id);

                let finished = false;

                await action.run(this, progress => {
                    if (finished) throw new Error('Cannot update progress after the action has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.enable_actions.length);
                });

                finished = true;
                setProgress((index + 1) / this.enable_actions.length);

                this.log.debug('Finished running scene #%d enable action #%d', this.id, action.id);
            } catch (err) {
                this.log.error('Error in scene #%d enable action #%d', this.id, action.id, err);
            }
        }));
    }

    /**
     * Adds an enable action.
     *
     * @param {AutomationAction} action
     */
    addEnableAction(...actions: AutomationAction[]) {
        for (const action of actions) {
            if (action.automations !== this.automations) {
                throw new Error('Cannot add an action from a different automations group');
            }

            if (this.enable_actions.includes(action)) continue;

            if (action.uuid && this.enable_actions.find(a => a.uuid === action.uuid)) {
                throw new Error('There is already an action with this UUID');
            }

            this.enable_actions.push(action);
        }
    }

    /**
     * Removes an enable action.
     *
     * @param {AutomationAction} action
     */
    removeEnableAction(...actions: AutomationAction[]) {
        for (const action of actions) {
            let index;
            while ((index = this.enable_actions.indexOf(action)) > -1) this.enable_actions.splice(index, 1);
        }
    }

    /**
     * Disables this scene.
     *
     * @param {object} [context]
     * @return {Promise}
     */
    disable(context?): Promise<void> {
        const trigger_event = new SceneTriggerEvent(this, false, context || {});
        this.emit(trigger_event, false, trigger_event.context);

        if (this._disabling) return this._disabling;

        this.disable_progress = 0;

        return this._disabling = (this._enabling || Promise.resolve()).then(() => {
            this.emit('disabling');
        }).then(() => this._disable(progress => {
            this.log.debug('Scene %s deactivate progress %d', this.id, progress);
            this.emit(SceneDeactivateProgressEvent, this, trigger_event, progress);
            this.emit('disable-progress', progress);
            this.disable_progress = progress;
        })).then(() => {
            this.log.debug('Scene %s deactivated', this.id);
            this.emit(SceneDeactivatedEvent, this, trigger_event);
            this.emit('disable-finished');
            this._disabling = null;
            this.disable_progress = 1;
        }, err => {
            this.emit('disable-error', err);
            this._disabling = null;
            this.disable_progress = 0;
            throw err;
        });
    }

    private async _disable(setProgress) {
        await Promise.all(this.disable_actions.map(async (action, index) => {
            try {
                this.log.debug('Running scene #%d disable action #%d', this.id, action.id);

                let finished = false;

                await action.run(this, progress => {
                    if (finished) throw new Error('Cannot update progress after the action has finished running');
                    if (progress < 0 || progress > 1) throw new Error('progress must be between 0 and 1');
                    setProgress((index + 1) * progress / this.disable_actions.length);
                });

                finished = true;
                setProgress((index + 1) / this.disable_actions.length);

                this.log.debug('Finished running scene #%d disable action #%d', this.id, action.id);
            } catch (err) {
                this.log.error('Error in scene #%d disable action #%d', this.id, action.id, err);
            }
        }));
    }

    /**
     * Adds a disable action.
     *
     * @param {AutomationAction} action
     */
    addDisableAction(...actions: AutomationAction[]) {
        for (const action of actions) {
            if (action.automations !== this.automations) {
                throw new Error('Cannot add an action from a different automations group');
            }

            if (this.disable_actions.includes(action)) continue;

            if (action.uuid && this.disable_actions.find(a => a.uuid === action.uuid)) {
                throw new Error('There is already an action with this UUID');
            }

            this.disable_actions.push(action);
        }
    }

    /**
     * Removes a disable action.
     *
     * @param {AutomationAction} action
     */
    removeDisableAction(...actions: AutomationAction[]) {
        for (const action of actions) {
            let index;
            while ((index = this.disable_actions.indexOf(action)) > -1) this.disable_actions.splice(index, 1);
        }
    }
}
