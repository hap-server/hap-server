import {Event} from '..';
import {AutomationTriggerEvent} from './automations';
import Scene from '../../automations/scene';

export class SceneTriggerEvent extends Event {
    static readonly type = 'scene-triggered';

    constructor(scene: Scene, enable: boolean, context) {
        super(scene, enable, context);
    }

    get scene(): Scene {
        return this.args[0];
    }

    get automations() {
        return this.scene.automations;
    }

    get server() {
        return this.automations.server;
    }

    get enable(): boolean {
        return this.args[1];
    }

    get disable() {
        return !this.enable;
    }

    get context() {
        return this.args[2];
    }
}

export class SceneActivateProgressEvent extends Event {
    static readonly type = 'scene-activate-progress';

    constructor(scene: Scene, parent: AutomationTriggerEvent, progress: number) {
        super(scene, parent, progress);
    }

    get scene(): Scene {
        return this.args[0];
    }

    get automations() {
        return this.scene.automations;
    }

    get server() {
        return this.automations.server;
    }

    get parent(): AutomationTriggerEvent {
        return this.args[1];
    }

    get context() {
        return this.parent.context;
    }

    get progress(): number {
        return this.args[2];
    }
}

export class SceneActivatedEvent extends Event {
    static readonly type = 'scene-activated';

    constructor(scene: Scene, parent: AutomationTriggerEvent) {
        super(scene, parent);
    }

    get scene(): Scene {
        return this.args[0];
    }

    get automations() {
        return this.scene.automations;
    }

    get server() {
        return this.automations.server;
    }

    get parent(): AutomationTriggerEvent {
        return this.args[1];
    }

    get context() {
        return this.parent.context;
    }
}

export class SceneDeactivateProgressEvent extends Event {
    static readonly type = 'scene-deactivate-progress';

    constructor(scene: Scene, parent: AutomationTriggerEvent, progress: number) {
        super(scene, parent, progress);
    }

    get scene(): Scene {
        return this.args[0];
    }

    get automations() {
        return this.scene.automations;
    }

    get server() {
        return this.automations.server;
    }

    get parent(): AutomationTriggerEvent {
        return this.args[1];
    }

    get context() {
        return this.parent.context;
    }

    get progress(): number {
        return this.args[2];
    }
}

export class SceneDeactivatedEvent extends Event {
    static readonly type = 'scene-deactivated';

    constructor(scene: Scene, parent: AutomationTriggerEvent) {
        super(scene, parent);
    }

    get scene() {
        return this.args[0];
    }

    get automations() {
        return this.scene.automations;
    }

    get server() {
        return this.automations.server;
    }

    get parent() {
        return this.args[1];
    }

    get context() {
        return this.parent.context;
    }
}
