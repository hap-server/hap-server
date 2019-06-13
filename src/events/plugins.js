import Events, {Event} from '.';

export class ServerPluginRegisteredEvent extends Event {
    get plugin() {
        return this.args[0];
    }

    get plugin_manager() {
        return this.plugin.plugin_manager;
    }

    get server_plugin() {
        return this.args[1];
    }
}

// ServerPluginRegisteredEvent.type = 'server-plugin-registered';
Events.ServerPluginRegisteredEvent = ServerPluginRegisteredEvent;
