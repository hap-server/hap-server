import {Event} from '..';
import {PluginManager, Plugin, ServerPlugin} from '../../server/plugins';

export class ServerPluginRegisteredEvent extends Event {
    constructor(plugin: Plugin, server_plugin: typeof ServerPlugin) {
        super(plugin, server_plugin);
    }

    get plugin(): Plugin {
        return this.args[0];
    }

    get plugin_manager(): PluginManager {
        return this.plugin.plugin_manager;
    }

    get server_plugin(): typeof ServerPlugin {
        return this.args[1];
    }
}

// ServerPluginRegisteredEvent.type = 'server-plugin-registered';
