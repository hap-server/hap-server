Plugins
---

hap-server supports all Homebridge plugins, but also has it's own plugin API that allows plugins to use hap-server
features.

To make hap-server load a Node.js package as a plugin you need to add the hap-server version it supports to the
`engines` property and `hap-server-plugin` to the `keywords` property of it's `package.json` file.

```json
{
    "name": "example-hap-server-plugin",
    "keywords": [
        "hap-server-plugin"
    ],
    "main": "index.js",
    "engines": {
        "@hap-server/hap-server": "^0.1.0",
        "node": "^8.0.0"
    }
}
```

Plugins can support both hap-server and Homebridge.

hap-server patches `Module._load` to allow plugins to load a virtual `@hap-server/api` module.

```js
import hapserver, {log} from '@hap-server/api';
// or
const {default: hapserver, log} = require('@hap-server/api');
```

As well as the `@hap-server/api` module that contains the plugin API and logger `@hap-server/api/hap` has the
`hap-nodejs` module, `@hap-server/api/plugin-config` has the plugin configuration, `@hap-server/api/storage` has a
`node-persist` object that can be used in handlers.

The `node-persist` object will be initialised *after* the plugin loads. If you need to do anything with `node-persist`
when a plugin loads export an `init` function. Errors thrown while loading the module will be ignored (and will
prevent the `init` function from being exported) but errors thrown from the `init` function will prevent the plugin
from loading.

```js
import storage from '@hap-server/api/storage';

export async function init() {
    // storage will now have been initialised
}
```

hap-server adds `get_handler` and `set_handler` helper properties to Characteristics that wrap characteristic get/set
handlers for async functions.

```js
lightbulb_service.getCharacteristic(Characteristics.On)
    .get_handler = async () => {
        const value = await light.getPowerState();
        return value;
    };
```

You can also use the `getHandler` and `setHandler` methods for chaining.

```js
lightbulb_service.getCharacteristic(Characteristics.On)
    .getHandler(async () => {
        const value = await light.getPowerState();
        return value;
    })
    .setHandler(async on => {
        await light.setPowerState(on);
    });
```

The `PluginAPI` instance (`hapserver`) has the following functions:

#### `hapserver.registerAccessory`

Registers an accessory type. You should pass a name to identify the accessory type and a function that creates
accessories. The handler function is passed the configuration object including the UUID or generated UUID and should
return either an Accessory or a Promise which resolves to an Accessory.

```js
import hapserver from '@hap-server/api';
import {Accessory} from '@hap-server/api/hap';

hapserver.registerAccessory('AccessoryType', config => {
    const accessory = new Accessory(config.name, config.uuid);

    // ...

    return accessory;
});
```

Most plugins will need to listen to the `destroy` event to disconnect from the accessory if it's removed from the
server.

```js
accessory.on('destroy', () => {
    // ...
});
```

#### `hapserver.registerAccessoryPlatform`

Registers an accessory platform. An accessory platform is similar to a HomeKit bridge as it provides multiple
accessories. An accessory platform can work in three ways:

- A function that returns [a Promise resolving to] an array of accessories
- A class that extends AccessoryPlatform
- A function that returns [a Promise resolving to] an array of accessories and has access to the AccessoryPlatform
    instance

```js
import hapserver from '@hap-server/api';
import {Accessory, uuid} from '@hap-server/api/hap';

hapserver.registerAccessoryPlatform('AccessoryBridge', async (config, cached_accessories) => {
    // This accessory platform connects to a bridge and returns an array of accessories exposed by the bridge
    // This shouldn't be used in most cases as the accessory platform cannot register any new accessories added to
    // the bridge

    const bridge = await Bridge.connect(config.host);
    const lights = await bridge.getLights();

    return Promise.all(lights.map(light => {
        const accessory = new Accessory(light.name, uuid.generate(config.uuid + ':' + light.uuid));

        // ...

        return accessory;
    }));
});
```

Most accessory platforms should either use `hapserver.registerDynamicAccessoryPlatform` or extend `AccessoryPlatform`.

```js
import hapserver, {AccessoryPlatform} from '@hap-server/api';
import {Accessory, uuid} from '@hap-server/api/hap';

const light_accessories = new WeakMap();

class AccessoryBridge extends AccessoryPlatform {
    async init(cached_accessories) {
        this.bridge = await Bridge.connect(this.config.host);
        const lights = await this.bridge.getLights();

        this.bridge.on('added-light', async light => this.addAccessory(await this.createAccessoryFromLight(light)));
        this.bridge.on('removed-light', light => {
            this.removeAccessory(light_accessories.get(light));
            light_accessories.delete(light);
        });

        this.registerAccessories(await Promise.all(lights.map(this.createAccessoryFromLight.bind(this))));

        // Once we've registered all accessories from the bridge we can clear any remaining cached accessories
        this.removeAllCachedAccessories();
    }

    async createAccessoryFromLight(light) {
        const accessory = new Accessory(light.name, uuid.generate(this.config.uuid + ':' + light.uuid));

        light_accessories.set(light, accessory);

        // ...

        return accessory;
    }
}

// The class' name will be used if one is not provided explicitly
hapserver.registerAccessoryPlatform(AccessoryBridge);
```

#### `hapserver.registerDynamicAccessoryPlatform`

Registers an accessory platform and provides the AccessoryPlatform instance. This allows the accessory platform to
register new accessories.

```js
import hapserver from '@hap-server/api';
import {Accessory, uuid} from '@hap-server/api/hap';

const light_accessories = new WeakMap();

async function createAccessoryFromLight(accessory_platform, config, bridge, light) {
    const accessory = new Accessory(light.name, uuid.generate(config.uuid + ':' + light.uuid));

    light_accessories.set(light, accessory);

    // ...

    return accessory;
}

hapserver.registerDynamicAccessoryPlatform('AccessoryBridge', async (accessory_platform, config, cached_accessories) => {
    // This accessory platform connects to a bridge and returns an array of accessories exposed by the bridge and
    // subscribes to "added-light" and "removed-light" events

    const bridge = await Bridge.connect(config.host);
    const lights = await bridge.getLights();

    bridge.on('added-light', async light => accessory_platform.addAccessory(
        await createAccessoryFromLight(accessory_platform, config, bridge, light)));
    bridge.on('removed-light', light => {
        accessory_platform.removeAccessory(light_accessories.get(light));
        light_accessories.delete(light);
    });

    return Promise.all(lights.map(createAccessoryFromLight.bind(null, accessory_platform, config, bridge)));
});
```

#### `hapserver.registerServerPlugin`

Registers a server plugin. Server plugins can be used to access the `Server` instance as there can be multiple
`Server`s in the same process.

```js
import hapserver, {ServerPlugin} from '@hap-server/api';

class AServerPlugin extends ServerPlugin {
    async load() {
        // ...
    }

    async unload() {
        // ...
    }
}

hapserver.registerServerPlugin(AServerPlugin);
```

To listen to events use the global events object which emits all events from `Server` instances.

```js
import {ServerEvents, events} from '@hap-server/api';
import {AddAccessoryEvent} from '@hap-server/api/events';

events.on(AddAccessoryEvent, event => {
    // event.server is the Server instance event.accessory was added to
});

// Events.prototype.on returns an EventListener which has a cancel method to remove the listener
// You can still use Events.prototype.removeListener - the EventListener object just helps keep a reference to the
// listener function
```

#### `hapserver.registerAccessoryUI`

Registers an Accessory UI object. Accessory UIs should load one or more scripts with `accessory_ui.loadScript` which
register UI components. In this example the `ui` directory will be available at `/accessory-ui/{accessory_ui.id}` and
the web interface will try to load `/accessory-ui/{accessory_ui.id}/index.js`.

```js
import hapserver, {AccessoryUI} from '@hap-server/api';
import path from 'path';

const accessory_ui = new AccessoryUI();

accessory_ui.loadScript('/index.js');
accessory_ui.static('/', path.join(__dirname, 'ui'));

hapserver.registerAccessoryUI(accessory_ui);
```

Accessory UIs have an [Express](https://expressjs.com) server at `accessory_ui.express`, which handles requests to
`/accessory-ui/{accessory_ui.id}`.

See [Accessory UIs](#accessory-uis) for information about what scripts can do once they're loaded into the web
interface.

#### `hapserver.registerAccessoryDiscovery`

Registers an accessory discovery handler. All accessory discovery handlers must have an accessory setup handler and
an accessory UI providing an accessory discovery component.

[See `accessoryui.registerAccessoryDiscoveryComponent`.](#accessoryuiregisteraccessorydiscoverycomponent)

```js
import hapserver, {AccessoryDiscovery, AccessorySetup} from '@hap-server/api';

const accessory_setup = new AccessorySetup('AccessoryType');
hapserver.registerAccessorySetup(accessory_setup);

const accessory_discovery = new AccessoryDiscovery(accessory_setup);
// Or if the accessory discovery handler's name should be different to the accessory setup handler's name:
// const accessory_discovery = new AccessoryDiscovery('AccessoryType', setup);

accessory_discovery.onstart = async () => {
    //
};

accessory_discovery.onstop = async () => {
    //
};

hapserver.registerAccessoryDiscovery(accessory_discovery);
```

#### `hapserver.registerAccessorySetup`

Registers an accessory setup handler. All accessory setup handlers must have an accessory UI providing an accessory
setup component.

[See `accessoryui.registerAccessorySetupComponent`.](#accessoryuiregisteraccessorysetupcomponent)

```js
import hapserver, {AccessorySetup} from '@hap-server/api';

const accessory_setup = new AccessorySetup('AccessoryType', async data => {
    // Handle messages from the accessory setup component
    // This is optional - most accessory setup handlers won't need to ask the server for anything
    // The returned/thrown value will be sent to the accessory setup component
});

hapserver.registerAccessorySetup(accessory_setup);
```

#### `hapserver.registerAuthenticationHandler`

Registers an authentication handler. Authentication handlers receive authentication messages from the web interface
and should register an accessory UI with an authentication handler component in the web interface.

See [`accessoryui.registerAuthenticationHandlerComponent`](#accessoryui-registerauthenticationhandlercomponent).

```js
import hapserver, {AuthenticatedUser} from '@hap-server/api';

hapserver.registerAuthenticationHandler('LocalStorage', async (data, previous_user) => {
    // Check the credentials from the web interface
    const user = await checkCredentialsAndGetUser(data);

    // Create an AuthenticatedUser object with a globally unique ID (used for permissions) and a name to display in the web interface
    const authenticated_user = new AuthenticatedUser(user.id, user.name || data.username);

    // Allow the user to automatically reauthenticate
    // You can do this conditionally (for example a "Remember me" checkbox or only on the local network) or not at all
    // You must call this before the handler returns otherwise it will have no effect
    await authenticated_user.enableReauthentication();

    return authenticated_user;

    // You don't have to return an AuthenticatedUser object immediately
    // You can return plain objects and throw errors and create a multi-step login process
});
```

You can also create an authentication handler separately to add a reconnect handler.

```js
import hapserver, {AuthenticationHandler, AuthenticatedUser, log} from '@hap-server/api';

const authentication_handler = new AuthenticationHandler('LocalStorage');

authentication_handler.handler = async (data, previous_user) => {
    // Check the credentials from the web interface
    const user = await checkCredentialsAndGetUser(data);

    // Create an AuthenticatedUser object with a globally unique ID (used for permissions) and a name to display in the web interface
    const authenticated_user = new AuthenticatedUser(user.id, user.name || data.username);

    // Allow the user to automatically reauthenticate
    // You can do this conditionally (for example a "Remember me" checkbox or only on the local network) or not at all
    // You must call this before the handler returns otherwise it will have no effect
    await authenticated_user.enableReauthentication();

    return authenticated_user;

    // You don't have to return an AuthenticatedUser object immediately
    // You can return plain objects and throw errors and create a multi-step login process
};

authentication_handler.reconnect_handler = async data => {
    // Restore the AuthenticatedUser from the saved data object
    return new AuthenticatedUser(data.id, data.name);
};

authentication_handler.disconnect_handler = async (authenticated_user, disconnected) => {
    log.info(authenticated_user.name, disconnected ? 'disconnected' : 'reauthenticated');
};

hapserver.registerAuthenticationHandler(authentication_handler);
```

#### `hapserver.registerUserManagementHandler`

Registers a user management handler. User management handlers run on the server and the web interface. User management
handlers aren't linked to authenticate handlers and don't have to have the same IDs.

See [`accessoryui.registerUserManagementHandler`](#accessoryui-registerusermanagementhandler).

```js
import hapserver, {UserManagementHandler} from '@hap-server/api';

const user_management_handler = new UserManagementHandler('PAM');

user_management_handler.handler = async request => {
    // ...
};

hapserver.registerUserManagementHandler(user_management_handler);
```

#### `hapserver.registerAutomationTrigger`

Registers an automation trigger.

```js
import hapserver, {AutomationTrigger} from '@hap-server/api';

class LocationTrigger extends AutomationTrigger {
    async onstart() {
        this.location_service = await LocationService.connect(this.config.token);
        this.location_service.on('update', this.handleLocationUpdate.bind(this));
    }

    async onstop() {
        this.location_service.removeListener('update', this.handleLocationUpdate.bind(this));
        await this.location_service.close();
        this.location_service = null;
    }

    handleLocationUpdate(event) {
        // Emit a "trigger" event
        this.trigger({person: event.person});
    }
}

hapserver.registerAutomationTrigger('Location', LocationTrigger);
```

#### `hapserver.registerAutomationCondition`

Registers an automation condition.

```js
import hapserver, {AutomationCondition} from '@hap-server/api';

class LocationCondition extends AutomationCondition {
    async check(runner) {
        const location_service = await LocationService.connect(this.config.token);

        const result = await location_service.checkPersonIsInArea(this.config.person, this.config.area);

        await location_service.close();

        return result;
    }
}

hapserver.registerAutomationCondition('Location', LocationCondition);
```

#### `hapserver.registerAutomationAction`

Registers an automation action.

```js
import hapserver, {AutomationAction} from '@hap-server/api';
import axios from 'axios';

class WebhookAction extends AutomationAction {
    async run(runner) {
        await axios.post(this.config.url);
    }
}

hapserver.registerAutomationTrigger('Webhook', WebhookAction);
```

### Accessory UIs

Accessory UIs register components in the web interface. Accessory UI scripts should be registered with
[`hapserver.registerAccessoryUI`](#hapserver-registeraccessoryui). Accessory UI scripts will have a `require` function
like Node.js modules. `require` can be used to get the exports of any script exposed by the Express server *that have
already been loaded*. You can load new scripts with `require.import`, which returns a Promise resolving to the script's
exports. Like plugins running on the server, Accessory UIs use the `require` function to access the plugin API.

> These examples are using Babel so `import Vue from 'vue';` maps to `const Vue = require('vue');`. Don't use the
> default ES6 `import` provided by the browser for modules provided by hap-server.

You can also use [webpack](https://webpack.js.org) to bundle your Accessory UI's dependencies. Remember to use
`__non_webpack_require__` to access the Accessory UI API or add the API as
[external modules](https://webpack.js.org/configuration/externals/):

```js
    externals: [
        (context, request, callback) => request.match(/^(@hap-server/accessory-ui-api(\/.+)|vue|axios|vue-color\/.+)$/g)
            ? callback(null, `require(${JSON.stringify(request)})`) : callback(),
    ],
```

Don't include Vue as a dependency of your plugin. The web interface plugin manager exposes Vue and axios through the
`require` function.

```js
import Vue from 'vue';
import axios from 'axios';

import ChromeColourPicker from 'vue-color/chrome';
import SwatchesColourPicker from 'vue-color/swatches';
import SketchColourPicker from 'vue-color/sketch';
```

You can also use the included `vuedraggable`, `codemirror` and `vue-codemirror` modules with `require.import`.

```js
const Draggable = await require.import('vuedraggable');
```

#### `accessoryui.registerServiceComponent`

Registers a service component (the small tile). This expects a service type and a
[Vue component](https://vuejs.org/v2/guide/). The Vue component will receive one prop, `service`.

```js
import accessoryui, {Service} from '@hap-server/accessory-ui-api';
import ServiceComponent from '@hap-server/accessory-ui-api/service';

accessoryui.registerServiceComponent(Service.LightSensor, {
    template: `<service class="service-light-sensor" :name="service.name || service.accessory.name">
        <p>{{ light }} lux</p>
    </service>`,
    components: {
        Service: ServiceComponent,
    },
    props: {
        service: Service,
    },
    computed: {
        light() {
            return this.service.getCharacteristicValueByName('CurrentAmbientLightLevel');
        },
    },
});
```

#### `accessoryui.registerAccessoryDetailsComponent`

Registers an accessory details component (the full screen view). This expects a service type and a
[Vue component](https://vuejs.org/v2/guide/). The Vue component will receive one prop, `service`.

```js
import accessoryui, {Service} from '@hap-server/accessory-ui-api';
import AccessoryDetails from '@hap-server/accessory-ui-api/accessory-details';

accessoryui.registerAccessoryDetailsComponent(Service.LightSensor, {
    template: `<accessory-details class="accessory-details-light-sensor" :name="service.name || service.accessory.name"
        @show-settings="$emit('show-settings')"
    >
        <p>Light Sensor</p>
        <p>{{ light }} lux</p>
    </accessory-details>`,
    components: {
        AccessoryDetails,
    },
    props: {
        service: Service,
    },
    computed: {
        light() {
            return this.service.getCharacteristicValueByName('CurrentAmbientLightLevel');
        },
    },
});
```

#### `accessoryui.registerCollapsedService`

Registers a collapsed service. This allows multiple services to be displayed as a single service. All services of the
registered types will be collapsed into a single service. The first argument doesn't have to be a real service UUID and
collapsed services don't have to collapse multiple services.

```js
import accessoryui, {Service} from '@hap-server/accessory-ui-api';

accessoryui.registerCollapsedService(Service.Television, [
    Service.Television,
    Service.InputSource,
    Service.TelevisionSpeaker,
]);
```

#### `accessoryui.registerAccessoryDiscoveryComponent`

Registers an accessory discovery component. This expects the name of an accessory discovery handler and a
[Vue component](https://vuejs.org/v2/guide/). The Vue component will receive one prop, `discovered-accessory`.

```js
import pluginapi, {DiscoveredAccessory} from '@hap-server/accessory-ui-api';
import AccessoryDiscovery from '@hap-server/accessory-ui-api/accessory-discovery';

const AccessoryDiscoveryComponent = {
    template: `<accessory-discovery :name="discoveredAccessory.name" type="Example accessory" @click="$emit('click')">
        <p>{{ discoveredAccessory.ip_address }}</p>
    </accessory-discovery>`,
    components: {
        AccessoryDiscovery,
    },
    props: {
        discoveredAccessory: DiscoveredAccessory,
    },
};

pluginapi.registerAccessoryDiscoveryComponent('AccessoryType', AccessoryDiscoveryComponent);
```

#### `accessoryui.registerAccessorySetupComponent`

Registers an accessory setup component. This expects the name of an accessory setup handler, a
[Vue component](https://vuejs.org/v2/guide/) and an optional object with additional options. The Vue component will
receive three props, `connection`, `discovered-accessory` and `creating`. The options object can have two properties,
`name` (a name to display if the accessory setup handler can be used without an accessory discovery handler) and
`manual` (`true` if the accessory setup handler can be used without an accessory discovery handler).

When the user has configured the accessory/accessory platform the component should emit an `accessory` or
`accessory-platform` event with the full configuration object (including the `plugin` and `accessory`/`platform`):

```js
this.$emit('accessory', {
    // hap-server will generate a UUID for the accessory
    plugin: 'some-plugin',
    accessory: 'AccessoryType',
    name: this.name,
    ip_address: this.ip_address,
});
// Or:
this.$emit('accessory-platform', {
    // hap-server will generate a base UUID for the accessory platform
    plugin: 'some-plugin',
    platform: 'AccessoryPlatform',
    name: this.name,
    ip_address: this.ip_address,
});
```

```js
import pluginapi, {AccessorySetupConnection, DiscoveredAccessory} from '@hap-server/accessory-ui-api';

const AccessorySetupComponent = {
    template: `<div class="accessory-setup">
        <!-- If the user selected a discovered accessory -->
        <template v-if="discoveredAccessory">
            <p>Data from the accessory discovery handler:</p>
            <pre>{{ JSON.stringify(discoveredAccessory, null, 4) }}</pre>
        </template>

        <!-- If the user selected the accessory setup handler from the list of accessory setup handlers -->
        <template v-else>
            <!-- Ask for data required to setup the accessory -->
        </template>

        <div class="d-flex">
            <div v-if="creating">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="creating"
                @click="$emit('cancel')">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button" :disabled="creating"
                @click="create">Add</button>
        </div>
    </div>`,
    props: {
        connection: AccessorySetupConnection,
        discoveredAccessory: DiscoveredAccessory,
        creating: Boolean,
    },
    data() {
        return {
            name: null,
            ip_address: null,
        };
    },
    methods: {
        create() {
            this.$emit('accessory', {
                plugin: 'some-plugin',
                accessory: 'AccessoryType',
                name: this.name,
                ip_address: this.ip_address,
            });
        },
    },
};

pluginapi.registerAccessorySetupComponent('AccessoryType', AccessorySetupComponent, {
    name: 'AccessoryType',
    manual: true,
});
```

#### `accessoryui.registerAuthenticationHandlerComponent`

Registers an authentication handler component.

See [`hapserver.registerAuthenticationHandler`](#hapserver-registerauthenticationhandler).

```js
import accessoryui, {AuthenticationHandlerConnection} from '@hap-server/accessory-ui-api';

const AuthenticationHandlerComponent = {
    template: `<div class="authentication-handler authentication-handler-storage">
        <form @submit.prevent="authenticate">
            <!-- Ask the user for their login credentials -->

            <div class="d-flex">
                <div class="flex-fill"></div>
                <button class="btn btn-default btn-sm" type="button" @click="$emit('close')">Cancel</button>
                <button class="btn btn-primary btn-sm" type="submit" :disabled="authenticating">Login</button>
            </div>
        </form>
    </div>`,
    props: {
        connection: AuthenticationHandlerConnection,
    },
    data() {
        return {
            authenticating: false,
            username: '',
            password: '',
        };
    },
    watch: {
        authenticating(authenticating) {
            this.$emit('authenticating', authenticating);
        },
    },
    methods: {
        async authenticate() {
            if (this.authenticating) throw new Error('Already authenticating');
            this.authenticating = true;

            try {
                const user = await this.connection.send({
                    username: this.username,
                    password: this.password,
                });

                // You don't have to return an AuthenticatedUser object immediately
                // You can make multiple requests to the authentication handler and create a multi-step login process

                this.$emit('user', user);
                this.$emit('close');
            } finally {
                this.authenticating = false;
            }
        },
    },
};

// First argument is the same ID passed to hapserver.registerAuthenticationHandler, second is a Vue component and the third is an optional display name for when multiple authentication handlers are available
accessoryui.registerAuthenticationHandlerComponent('LocalStorage', AuthenticationHandlerComponent, 'Local Storage');
```

#### `accessoryui.registerUserManagementHandler`

Registers a user management handler component.

See [`hapserver.registerUserManagementHandler`](#hapserver-registerusermanagementhandler).

```js
import

const UserManagementComponent = {
    template: `<div>
        <slot name="info" />

        <!-- ... -->

        <slot name="location" />
        <slot name="permissions" />
    </div>`,
    props: {
        userManagementHandler: BaseUserManagementHandler,
        user: UserManagementUser,
    },
    data() {
        return {
            saving: false,
            error: null,

            // ...
        };
    },
    computed: {
        changed() {
            // ...
        },
    },
    watch: {
        changed(changed) {
            this.$emit('changed', changed);
        },
        saving(saving) {
            this.$emit('saving', saving);
        },
    },
    methods: {
        async save() {
            if (this.saving) throw new Error('Already saving');
            this.saving = true;
            this.error = null;

            try {
                await this.userManagementHandler.connection.send({
                    // ...
                });
            } catch (err) {
                this.error = err;
            } finally {
                this.saving = false;
            }
        },
    },
};

class LocalUsersManagementHandler extends UserManagementHandler {
    async getUsers() {
        // ...
    }
}

LocalUsersManagementHandler.component = UserManagementComponent;

accessoryui.registerUserManagementHandler('LocalUsers', LocalUsersManagementHandler, 'Local users');
```

#### `accessoryui.registerLayoutSectionComponent`

Registers a layout section component. This expects a layout section type, a
[Vue component](https://vuejs.org/v2/guide/) and a name to display in the add section dropdown. The Vue component
will receive four props, `section`, `accessories`, `accessories-draggable-group` and `editing`.

To update the layout section's data you should emit the `update-data` event with new values to merge into the section
object. Don't update the section's data unless the user is editing the layout (`editing` prop).

```js
this.$emit('update-data', {lights: ...});
```

```js
import accessoryui from '@hap-server/accessory-ui-api';
import LayoutSection from '@hap-server/accessory-ui-api/layout-section';

// Must be globally unique
const LightsLayoutSectionType = 'FDC60D42-4F6D-4F38-BB3F-E6AB38EC8B87';

accessoryui.registerLayoutSectionComponent(LightsLayoutSectionType, {
    template: `<layout-section class="accessory-details-light-sensor" :section="section"
        :name="section.name" default-name="Lights" :editing="editing"
        @edit="$emit('edit', $event)" @update-name="$emit('update-name', $event)"
    >
        <p>Light Sensor</p>
        <p>{{ light }} lux</p>
    </layout-section>`,
    components: {
        LayoutSection,
        Draggable: () => require.import('vuedraggable'),
    },
    props: {
        section: Object,
        accessories: Object,
        accessoriesDraggableGroup: String,
        editing: Boolean,
    },
}, 'Lights');
```

#### `accessoryui.registerAutomationTriggerComponent`

Registers an automation trigger editor component. This expects an automation trigger type, a
[Vue component](https://vuejs.org/v2/guide/) and a name to display in the add trigger dropdown. The Vue component
will receive four props, `id`, `trigger`, `editable` and `saving`.

To update the trigger's configuration update the `trigger` configuration object directly. Don't update the trigger's
configuration unless the user is allowed to edit the trigger (`editable` prop).

```js
import accessoryui from '@hap-server/accessory-ui-api';

accessoryui.registerAutomationTriggerComponent('Location', {
    template: `<automation-trigger class="automation-trigger-locationservice" :id="id" :trigger="trigger"
        :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        Token: <input v-model="trigger.token" type="text" />
    </automation-trigger>`,
    components: {
        AutomationTrigger: () => require.import('@hap-server/accessory-ui-api/automation-trigger'),
    },
    props: {
        id: String,
        trigger: Object,
        editable: Boolean,
        saving: Boolean,
    },
}, 'Location service');
```

You can also pass the name of the plugin that registered the automation trigger if it's not the same as the plugin
that registered the accessory UI.

```js
accessoryui.registerAutomationTriggerComponent('Location', ..., 'Location service', 'location-service-plugin');
```

#### `accessoryui.registerAutomationConditionComponent`

Registers an automation condition editor component. This expects an automation condition type, a
[Vue component](https://vuejs.org/v2/guide/) and a name to display in the add condition dropdown. The Vue component
will receive four props, `id`, `condition`, `editable` and `saving`.

To update the condition's configuration update the `condition` configuration object directly. Don't update the
condition's configuration unless the user is allowed to edit the condition (`editable` prop).

```js
import accessoryui from '@hap-server/accessory-ui-api';

accessoryui.registerAutomationConditionComponent('Location', {
    template: `<automation-condition class="automation-condition-locationservice" :id="id" :condition="condition"
        :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        Token: <input v-model="condition.token" type="text" />
        Person ID: <input v-model="condition.person" type="text" />
        Area: <input v-model="condition.area" type="text" />
    </automation-condition>`,
    components: {
        AutomationCondition: () => require.import('@hap-server/accessory-ui-api/automation-condition'),
    },
    props: {
        id: String,
        condition: Object,
        editable: Boolean,
        saving: Boolean,
    },
}, 'Location service');
```

You can also pass the name of the plugin that registered the automation condition if it's not the same as the plugin
that registered the accessory UI.

```js
accessoryui.registerAutomationConditionComponent('Location', ..., 'Location service', 'location-service-plugin');
```

#### `accessoryui.registerAutomationActionComponent`

Registers an automation action editor component. This expects an automation action type, a
[Vue component](https://vuejs.org/v2/guide/) and a name to display in the add action dropdown. The Vue component will
receive four props, `id`, `action`, `editable` and `saving`.

To update the action's configuration update the `action` configuration object directly. Don't update the action's
configuration unless the user is allowed to edit the action (`editable` prop).

```js
import accessoryui from '@hap-server/accessory-ui-api';

accessoryui.registerAutomationActionComponent('Webhook', {
    template: `<automation-action class="automation-action-webhook" :id="id" :action="action"
        :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        URL: <input v-model="action.url" type="text" />
    </automation-action>`,
    components: {
        AutomationAction: () => require.import('@hap-server/accessory-ui-api/automation-action'),
    },
    props: {
        id: String,
        action: Object,
        editable: Boolean,
        saving: Boolean,
    },
}); // If a display name is not passed the trigger/condition/action type will be used
```

You can also pass the name of the plugin that registered the automation action if it's not the same as the plugin
that registered the accessory UI.

```js
accessoryui.registerAutomationActionComponent('Webhook', ..., 'Webhook', 'webhook-plugin');
```
