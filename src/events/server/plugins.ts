import {Event} from '..';
import {PluginManager, Plugin, ServerPlugin} from '../../server/plugins';

export class ServerPluginRegisteredEvent extends Event {
    constructor(plugin: Plugin, plugin_manager: PluginManager, server_plugin: ServerPlugin) {
        super(plugin, plugin_manager, server_plugin);
    }

    get plugin(): Plugin {
        return this.args[0];
    }

    get plugin_manager(): PluginManager {
        return this.plugin.plugin_manager;
    }

    get server_plugin(): ServerPlugin {
        return this.args[1];
    }
}

// ServerPluginRegisteredEvent.type = 'server-plugin-registered';
