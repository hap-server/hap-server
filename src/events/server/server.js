import {Event} from '..';

export class ServerStartupFinishedEvent extends Event {
    get server() {
        return this.args[0];
    }
}

// ServerStartupFinishedEvent.type = 'server-startup-finished';

export class ServerStoppingEvent extends Event {
    get server() {
        return this.args[0];
    }
}

// ServerStoppingEvent.type = 'server-stopping';
