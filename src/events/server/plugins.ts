import {Event} from '..';
import {PluginManager, Plugin, ServerPluginHandler} from '../../server/plugins';

export class ServerPluginRegisteredEvent extends Event {
    constructor(plugin: Plugin, server_plugin: ServerPluginHandler) {
        super(plugin, server_plugin);
    }

    get plugin(): Plugin {
        return this.args[0];
    }

    get plugin_manager(): PluginManager {
        return this.plugin.plugin_manager;
    }

    get server_plugin(): ServerPluginHandler {
        return this.args[1];
    }
}

// ServerPluginRegisteredEvent.type = 'server-plugin-registered';
