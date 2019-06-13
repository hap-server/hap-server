import Events, {Event} from '.';

export class ServerStartupFinishedEvent extends Event {
    get server() {
        return this.args[0];
    }
}

// ServerStartupFinishedEvent.type = 'server-startup-finished';
Events.ServerStartupFinishedEvent = ServerStartupFinishedEvent;

export class ServerStoppingEvent extends Event {
    get server() {
        return this.args[0];
    }
}

// ServerStoppingEvent.type = 'server-stopping';
Events.ServerStoppingEvent = ServerStoppingEvent;
