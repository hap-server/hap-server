import {Event} from '..';
import {Server} from '../../server';

export class ServerStartupFinishedEvent extends Event {
    constructor(server: Server) {
        super(server);
    }

    get server(): Server {
        return this.args[0];
    }
}

// ServerStartupFinishedEvent.type = 'server-startup-finished';

export class ServerStoppingEvent extends Event {
    constructor(server: Server) {
        super(server);
    }

    get server(): Server {
        return this.args[0];
    }
}

// ServerStoppingEvent.type = 'server-stopping';
