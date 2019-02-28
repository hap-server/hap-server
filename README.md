HomeKit Accessory Server
===

Homebridge, but with a web interface for controlling and configuring accessories.

### TODO

A lot.

- [x] Basic accessory control (on/off)
    - [x] Switch
    - [x] Lightbulb
    - [x] Programmable Switch (shows last action for five seconds)
    - [ ] [All other services supported by hap-nodejs](https://github.com/khaost/hap-nodejs/tree/master/lib/gen)
- [ ] Accessory control
    - [ ] [All services supported by hap-nodejs](https://github.com/khaost/hap-nodejs/tree/master/lib/gen)
- [ ] Historical data
    - [ ] Store changes to an accessory's state
    - [ ] Elgato Eve???
- [ ] Security
    - [ ] Authentication
    - [ ] Users (maybe use system users/LDAP?)
    - [ ] Permissions
    - [ ] Per-user HomeKit bridges
        - This would allow you to configure all accessories in Homebridge and then allow multiple people to create
            their own homes with read-only access (or no access) to other people's accessories instead of sharing a
            single home where everyone has permission to control all accessories
- [ ] Automations
    - [ ] Create automations that can run in Homebridge
        - Useful if you don't have an Apple TV 4, HomePod or always home iPad
        - Also could easily allow for more flexible automations than HomeKit allows
- [ ] Configuration
    - [ ] Add + configure accessories in the web interface
        - [x] Set home/accessory/service names
    - [x] Server output
    - [ ] Manage users/permissions
    - [ ] Manage HomeKit bridges + choose accessories to expose
        - Per-user HomeKit bridges (see above)
    - [ ] Manage + name HomeKit pairings
- [x] Plugins
    - [x] Accessories
    - [ ] Accessory platforms
    - [x] All current Homebridge accessories + accessory platforms
    - [ ] Web interface plugins
        - [ ] Accessory control
        - [ ] Accessory + accessory platform discovery + setup
        - [ ] Accessory + accessory platform configuration
        - Maybe allow plugins to mount a static directory on the web server then try to evaluate a JavaScript file?
    - [ ] Web interface themes?
    - [ ] Automation plugins
        - Automation plugins can run other automation checks
        - [ ] Automation triggers
        - [ ] Automation conditions
    - [ ] Install + manage plugins in the web interface?
        - Like server output???
- [x] Full compatibility with Homebridge
    - Run instead of Homebridge and use all Homebridge plugins with the web interface

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

hap-server patches `Module._load` to allow plugins to load a virtual `hap-server-api` module.

```js
import hapserver, {log} from 'hap-server-api';
// or
const {default: hapserver, log} = require('hap-server-api');
```

As well as the `hap-server-api` module that contains the plugin API and logger `hap-server-api/hap` has the
`hap-nodejs` module, `hap-server-api/hap-async` has the Accessory, Service and Characteristic classes from `hap-nodejs`
but extended to use Promises instead of callbacks and `hap-server-api/storage` has a `node-persist` object that can be
used in handlers.

The `PluginAPI` instance (`hapserver`) has the following functions:

#### `hapserver.registerAccessory`

Registers an accessory type. It should pass a name to identify the accessory type and a function that creates
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

TODO

#### `hapserver.registerAccessoryDiscovery`

TODO

#### `hapserver.registerAccessorySetup`

TODO
