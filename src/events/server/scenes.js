import {Event} from '..';

export class SceneTriggerEvent extends Event {
    get scene() {
        return this.args[0];
    }

    get automations() {
        return this.scene.automations;
    }

    get server() {
        return this.automations.server;
    }

    get enable() {
        return this.args[1];
    }

    get disable() {
        return !this.enable;
    }

    get context() {
        return this.args[2];
    }
}

SceneTriggerEvent.type = 'scene-triggered';

export class SceneActivateProgressEvent extends Event {
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

    get progress() {
        return this.args[2];
    }
}

SceneActivateProgressEvent.type = 'scene-activate-progress';

export class SceneActivatedEvent extends Event {
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

SceneActivatedEvent.type = 'scene-activated';

export class SceneDeactivateProgressEvent extends Event {
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

    get progress() {
        return this.args[2];
    }
}

SceneDeactivateProgressEvent.type = 'scene-deactivate-progress';

export class SceneDeactivatedEvent extends Event {
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

SceneDeactivatedEvent.type = 'scene-deactivated';
