HomeKit Accessory Server
===

Home automation system based on HomeKit.

It includes a web interface for controlling accessories. Scenes, custom controls, configuring accessories in the web
interface, storing historical data and automations are not supported yet.

It includes a plugin system to add accessories, accessory configuration, authentication and options for automations.
All Homebridge plugins are supported and work with the web interface but cannot be added to additional HAP bridges.

### TODO

A lot.

- Web interface
    - [x] Layouts
        - Customisable by dragging sections and accessories in the web interface.
        - [ ] Scenes
        - [x] [Custom sections with plugins](#accessoryuiregisterlayoutsectioncomponent)
    - [x] Basic accessory control (on/off)
        - [x] Switch
        - [x] Lightbulb
        - [x] Programmable Switch (shows last action for five seconds)
        - [x] Outlet
        - [x] Television
        - [ ] [All other services supported by hap-nodejs](https://github.com/khaost/hap-nodejs/tree/master/lib/gen)
        - [x] [Other services with plugins](#accessoryuiregisterservicecomponent)
    - [x] Accessory control
        - [x] Switch
        - [x] Lightbulb
        - [ ] Programmable Switch
        - [x] Outlet
        - [ ] Television
        - [ ] [All other services supported by hap-nodejs](https://github.com/khaost/hap-nodejs/tree/master/lib/gen)
        - [x] [Other services with plugins](#accessoryuiregisteraccessorydetailscomponent)
- [ ] Historical data
    - [ ] Store changes to an accessory's state
    - [ ] Elgato Eve???
- [ ] Security
    - [x] Web interface authentication
        - Completely handled by plugins.
    - [ ] Permissions
    - [ ] Per-user HomeKit bridges
        - This would allow you to configure all accessories in hap-server and then allow multiple people to create
            their own homes with read-only access (or no access) to other people's accessories instead of sharing a
            single home where everyone has permission to control all accessories.
- [ ] Automations
    - [ ] Create automations that can run on the server
        - Useful if you don't have an Apple TV 4, HomePod or always home iPad.
        - Also could easily allow for more flexible automations than HomeKit allows.
- [ ] Configuration
    - [ ] Add + configure accessories in the web interface
        - [x] Set home/accessory/service names
    - [x] Server output
    - [x] Custom layouts
    - [ ] Manage users/permissions
    - [ ] Manage HomeKit bridges + choose accessories to expose
        - Per-user HomeKit bridges (see above)
    - [ ] Expose accessories via multiple bridges
    - [ ] Manage + name HomeKit pairings
- [x] Plugins
    - [x] Accessories
    - [ ] Accessory platforms
    - [x] All current Homebridge accessories + accessory platforms
    - [x] Web interface plugins
        - [x] Basic accessory control
        - [x] Accessory control
        - [ ] Accessory + accessory platform discovery + setup
        - [ ] Accessory + accessory platform configuration
        - [x] Authentication
        - [ ] User management
    - [ ] Web interface themes?
    - [ ] Automation plugins
        - Automation plugins can run other automation checks
        - [ ] Automation triggers
        - [ ] Automation conditions
    - [ ] Install + manage plugins in the web interface?
        - Like server output???
- Internal features
    - [x] Cached accessories
        - Accessory configuration can be cached so the server can run immediately and have accessories load in the
            background.
- [x] Full compatibility with Homebridge
    - Run instead of Homebridge and use all Homebridge plugins with the web interface. Homebridge accessories appear
        and can be controlled in the web interface and by automations on the server and Homebridge's HAP bridge but
        cannot be added to hap-server's HAP bridges.

Installation
---

```
npm install -g hap-server

# Or if that doesn't work
sudo npm install -g hap-server
```

This will install hap-server and link the `hap-server` executable.

You can now run hap-server with your configuration. Once you've tested your configuration you'll probably want to
set it up as a system service with `systemd` (Debian), `launchd` (macOS) or whatever service manager you have
installed.

hap-server requires a plugin to authenticate access to the web interface. You can use the
[authenticate-pam](https://gitlab.fancy.org.uk/samuel/hap-server-authenticate-pam) plugin to allow local users on the
server to access the web interface. If you don't install an authentication handler you won't be able to access the
web interface, but you'll still be able to configure hap-server using it's configuration file.

```
npm install -g https://gitlab.fancy.org.uk/samuel/hap-server-authenticate-pam
```

Usage
---

To run hap-server, just run `hap-server`.

```
Samuels-MacBook-Air:~ samuel$ hap-server
[28/02/2019, 01:56:01] Starting hap-server with configuration file /Users/samuel/.homebridge/config.json
...
```

hap-server will exit with an error if the configuration file doesn't exist. To use a custom configuration file path
pass it as the first argument.

```
Samuels-MacBook-Air:hap-server samuel$ hap-server data/config.json
[28/02/2019, 01:56:01] Starting hap-server with configuration file /Users/samuel/Documents/Projects/hap-server/data/config.json
...
```

All Homebridge command line flags work with hap-server.

```
Samuels-MacBook-Air:~ samuel$ hap-server help
hap-server [config]

Run the HAP and web server

Commands:
  hap-server [config]     Run the HAP and web server                   [default]
  hap-server version      Show version number

Positionals:
  config  The configuration file to use
                     [string] [default: "/Users/samuel/.homebridge/config.json"]

Options:
  --debug, -D                  Enable debug level logging
                                                      [boolean] [default: false]
  --timestamps, -T             Add timestamps to logs  [boolean] [default: true]
  --force-colour, -C           Force colour in logs   [boolean] [default: false]
  --help                       Show help                               [boolean]
  --data-path, -U              Path to store data                       [string]
  --plugin-path, -P            Additional paths to look for plugins at as well
                               as the default location ([path] can also point to
                               a single plugin)                          [array]
  --print-setup, -Q            Print setup information[boolean] [default: false]
  --allow-unauthenticated, -I  Allow unauthenticated requests (for easier
                               hacking)               [boolean] [default: false]
  --user, -u                   User to run as after starting
  --group, -g                  Group to run as after starting
```

To show the version number run `hap-server version`.

```
Samuels-MacBook-Air:~ samuel$ hap-server version
hap-server version 0.1.0
homebridge version 0.4.46
hap-nodejs version 0.4.48
```

Configuration
---

hap-server stores data in the same default location as Homebridge and supports the same configuration. Using the same
configuration as Homebridge, hap-server will behave exactly like Homebridge but will have a web interface for
controlling accessories. Using Homebridge and hap-server plugins at the same time are supported, however you shouldn't
run multiple instances of hap-server/Homebridge using the same data location.

<!-- When using Homebridge accessories in the web interface, you can control, rename and move Homebridge accessories, but
not configure them. Configuring Homebridge accessories must be done by editing the `config.json` file. -->

```json
{
    "http_host": "127.0.0.1",
    "http_port": "8080",
    "bridges": [
        {
            "username": "00:00:00:00:00:10",
            "name": "Bridge 0010",
            "accessories": [
                ["virtual-switches", "VirtualSwitch", "Switch #1"]
            ]
        }
    ],
    "accessories2": [
        {
            "plugin": "virtual-switches",
            "accessory": "VirtualSwitch",
            "name": "Switch #1"
        }
    ]
}
```

### `bridge`, `accessories` and `platforms`

All configuration options of Homebridge are supported. hap-server will only load Homebridge when the `bridge` property
exists.

### `http_host`

The host to listen to connections for the web interface on. By default hap-server will bind to all addresses.

### `http_port`

The port to listen to connections for the web interface on. By default hap-server will use any available port, so you
will probably want to set this.

### `data-path`

The `data-path` property sets the base path for storing data. By default this is the directory your `config.json` file
is in.

### `plugin-path`

An array of plugin paths to add or a single plugin path.

```json
{
    "plugin-path": [
        "../example-plugins/dist/virtual-switches"
    ]
}
```
```json
{
    "plugin-path": "../example-plugins/dist/virtual-switches"
}
```

#### Single file plugins

You can also provide the path to a single JavaScript file and it will be loaded as a plugin, but will not be able to
use the `hap-server-api/plugin-config` or `hap-server-api/storage` modules.

### `plugins`

The `plugins` property can be used to enable/disable features of and configure plugins. Useful if you have are running
multiple instances.

Keys are plugin names or the special value `"*"` which applies to plugins that aren't listed.

```json
{
    "plugins": {
        "hap-server-authenticate-pam": true,
        "authentication-handler": {
            ...
        }
    }
}
```

#### `plugins[]`

Either a boolean (`true`/`false`) or an object containing plugin configuration and specific features to enable/disable.

If `false` the plugin will be disabled. When a plugin is disabled it will not be loaded.

```json
{
    "hap-server-authenticate-pam": false
}
```

Valid keys are `"accessory-uis"`, `"accessory-discovery"`, `"accessory-setup"` and `"authentication-handlers"`. Other
options are passed to the plugin.

```json
{
    "example-plugin": {
        "accessory-uis": false
    }
}
```

#### `plugins[]['accessory-uis']`

Either a boolean (`true`/`false`) or an object containing specific Accessory UIs to enable.

Keys are Accessory UI IDs or the special value `"*"` which applies to Accessory UIs that aren't listed. Accessory UIs
have global numeric IDs so want to use `"*"` as IDs can change when updating plugins, hap-server or your configuration.

```json
{
    "accessory-uis": {
        "*": false
    }
}
```

##### `plugins[]['accessory-uis'][]`

Either a boolean (`true`/`false`) or an object containing specific Accessory UI features to enable.

Valid keys are `"service-tiles"`, `"accessory-details"` and `"collapsed-services"`. Other options are passed to the
Accessory UI.

```json
{
    "*": {
        "service-tiles": false
    }
}
```

##### `plugins[]['accessory-uis'][]['service-tiles']`

Whether [service tile components](#accessoryuiregisterservicecomponent) from this Accessory UI should be enabled.

##### `plugins[]['accessory-uis'][]['accessory-details']`

Whether [accessory details components](#accessoryuiregisteraccessorydetailscomponent) from this Accessory UI should
be enabled.

##### `plugins[]['accessory-uis'][]['collapsed-services']`

Whether [collapsed services](#accessoryuiregistercollapsedservicescomponent) from this Accessory UI should be enabled.

#### `plugins[]['accessory-discovery']`

TODO

#### `plugins[]['accessory-setup']`

TODO

#### `plugins[]['authentication-handlers']`

Either a boolean (`true`/`false`) or an object containing specific authentication handlers to enable.

Keys are Accessory UI IDs or the special value `"*"` which applies to Accessory UIs that aren't listed. Accessory UIs
have global numeric IDs so want to use `"*"` as IDs can change when updating plugins, hap-server or your configuration.

```json
{
    "authentication-handlers": {
        "LocalStorage": false
    }
}
```

### `bridges`

The `bridges` property is an array of bridge configuration objects. Each bridge must have a username property, but
all other properties are optional.

#### `bridges[].username`

The `username` property is used to identify the bridge. It must be unique not just on the server, but the network the
bridge is published on.

#### `bridges[].uuid`

The bridge `uuid` is also used to identify the bridge, but only needs to be unique to the server.

#### `bridges[].name`

The bridge `name` will be displayed in HomeKit.

#### `bridges[].port`

`port` is the port the HAP server will listen on. If `0` (default) it will use any available port, which should be
fine as your devices will use DNS Service Discovery to discover the server.

#### `bridges[].pincode`

The bridge `pincode` is used to authenticate new device pairings. As you can only manually pair one device to a single
HAP accessory/bridge this is useless after you've paired with the server.

#### `bridges[].unauthenticated_access`

When `true` the `unauthenticated_access` flag will allow access to the HAP server without authentication.

#### `bridges[].accessories`

An array of accessory UUIDs/plugin-accessory-name arrays. By default accessories will not be added to a bridge, so you
will have to add them manually.

```json
"accessories": [
    "108ee027-3c7e-4852-ac2e-016543f46fb9",
    ["virtual-switches", "VirtualSwitch", "Switch #1"]
]
```

### `accessories2`

The `accessories2` property is an array of accessory configuration objects. Plugins can use any additional properties.

`accessories2` works exactly the same as `accessories`, but uses hap-server plugins instead of Homebridge plugins.

#### `accessories2[].plugin`

The name of the plugin providing this accessory.

#### `accessories2[].accessory`

The type of accessory.

#### `accessories2[].name`

The name to display in HomeKit (can be changed in both HomeKit and the web interface separately).

#### `accessories[2].uuid`

Optional. If not provided a UUID will be generated from the plugin name, accessory type and accessory name.

### `platforms2`

TODO

Development
---

```
# Clone the git repository
git clone https://gitlab.fancy.org.uk/samuel/hap-server
cd hap-server

# Install dependencies
npm install

# Build/watch the backend and example plugins
npx gulp watch-backend watch-example-plugins &

# Copy the example configuration
cp -r example-config data

# Run the server (this will build the frontend)
bin/hap-server data/config.json
```

To use the [standalone Vue devtools](https://github.com/vuejs/vue-devtools/blob/master/shells/electron/README.md)
run `npx vue-devtools` and pass the `--vue-devtools-port` flag to `hap-server`.

```
npx vue-devtools &

bin/hap-server data/config.json --vue-devtools-port 8098
# Also pass --vue-devtools-host if you want to use the Vue devtools to work on other devices
bin/hap-server data/config.json --vue-devtools-host samuels-macbook-air.local --vue-devtools-port 8098
```

Plugins
---

hap-server supports all Homebridge plugins, but also has it's own plugin API that allows plugins to use hap-server
features.

To make hap-server load a Node.js package as a plugin you need to add the `hap-server` version it supports to the
`engines` property and `hap-server-plugin` to the `keywords` property of it's `package.json` file.

```json
{
    "name": "example-hap-server-plugin",
    "keywords": [
        "hap-server-plugin"
    ],
    "main": "index.js",
    "engines": {
        "hap-server": "^0.1.0",
        "node": "^8.0.0"
    }
}
```

Plugins can support both hap-server and Homebridge.

hap-server patches `Module._load` to allow plugins to load a virtual `hap-server-api` module.

```js
import hapserver, {log} from 'hap-server-api';
// or
const {default: hapserver, log} = require('hap-server-api');
```

As well as the `hap-server-api` module that contains the plugin API and logger `hap-server-api/hap` has the
`hap-nodejs` module, `hap-server-api/hap-async` has the Accessory, Service and Characteristic classes from `hap-nodejs`
but extended to use Promises instead of callbacks, `hap-server-api/config` has the plugin configuration,
`hap-server-api/storage` has a `node-persist` object that can be used in handlers.

The `node-persist` object will be initialised *after* the plugin loads. If you need to do anything with `node-persit`
when a plugin loads export an `init` function. Errors thrown while loading the module will be ignored (and will
prevent the `init` function from being exported) but errors thrown from the `init` function will prevent the plugin
from loading.

```js
import storage from 'hap-server-api/storage';

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
import hapserver from 'hap-server-api';
import {Accessory} from 'hap-server-api/hap-async';

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
import hapserver, {AccessoryUI} from 'hap-server-api';
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
import hapserver, {AuthenticatedUser} from 'hap-server-api';

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
import hapserver, {AuthenticationHandler, AuthenticatedUser, log} from 'hap-server-api';

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
        (context, request, callback) => request.match(/^(hap-server-api\/.*|vue|axios)$/g) ? callback(null, `require(${JSON.stringify(request)})`) : callback(),
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
import accessoryui, {Service} from 'hap-server-api/accessory-ui';
import ServiceComponent from 'hap-server-api/accessory-ui/service';

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
import accessoryui, {Service} from 'hap-server-api/accessory-ui';
import AccessoryDetails from 'hap-server-api/accessory-ui/accessory-details';

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
import accessoryui, {Service} from 'hap-server-api/accessory-ui';

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
import accessoryui, {AuthenticationHandlerConnection} from 'hap-server-api/accessory-ui';

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
import accessoryui, {LayoutSection} from 'hap-server-api/accessory-ui';
import AccessoryDetails from 'hap-server-api/accessory-ui/accessory-details';

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
