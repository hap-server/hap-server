const {default: hapserver, ServerPlugin, EventListeners, log} = require('@hap-server/api');
const {AddAccessoryEvent} = require('@hap-server/api/events');

class ExampleServerPlugin extends ServerPlugin {
    async load() {
        log.info('Loading server plugin', this.id, this.instance_id);

        if (!this.listeners) this.listeners = new EventListeners();

        // This is just an example of creating server plugins
        // You could also listen on the global events object
        this.server.on(AddAccessoryEvent, event => {
            log.withPrefix('ServerPlugin', this.id, this.instance_id)
                .info('Added accessory %s to server', event.accessory.UUID);
        }, this.listeners);
    }

    async unload() {
        log.info('Unloading server plugin', this.id, this.instance_id);

        this.listeners.cancel(true);
    }
}

hapserver.registerServerPlugin(ExampleServerPlugin);
