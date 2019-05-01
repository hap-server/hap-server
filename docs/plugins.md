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
`hap-nodejs` module, `@hap-server/api/hap-async` has the Accessory, Service and Characteristic classes from `hap-nodejs`
but extended to use Promises instead of callbacks, `@hap-server/api/config` has the plugin configuration,
`@hap-server/api/storage` has a `node-persist` object that can be used in handlers.

The `node-persist` object will be initialised *after* the plugin loads. If you need to do anything with `node-persit`
when a plugin loads export an `init` function. Errors thrown while loading the module will be ignored (and will
prevent the `init` function from being exported) but errors thrown from the `init` function will prevent the plugin
from loading.

```js
import storage from '@hap-server/api/storage';

export async function init() {
    // storage will now have been initialised
}
```

The `PluginAPI` instance (`hapserver`) has the following functions:

#### `hapserver.registerAccessory`

Registers an accessory type. You should pass a name to identify the accessory type and a function that creates
accessories. The handler function is passed the configuration object including the UUID or generated UUID and should
return either an Accessory or a Promise which resolves to an Accessory.

```js
import hapserver from '@hap-server/api';
import {Accessory} from '@hap-server/api/hap-async';

hapserver.registerAccessory('AccessoryType', config => {
    const accessory = new Accessory(config.name, config.uuid);

    // ...

    return accessory;
});
```

#### `hapserver.registerAccessoryPlatform`

TODO

#### `hapserver.registerDynamicAccessoryPlatform`

TODO

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

TODO

#### `hapserver.registerAccessorySetup`

TODO

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

#### `accessoryui.registerLayoutSectionComponent`

Registers a layout section component. This expects a layout section type and a
[Vue component](https://vuejs.org/v2/guide/). The Vue component will receive four props, `section`, `accessories`,
`accessories-draggable-group` and `editing`.

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
});
```
