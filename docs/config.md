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
use the `@hap-server/api/plugin-config` or `@hap-server/api/storage` modules.

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

Whether [service tile components](plugins.md#accessoryuiregisterservicecomponent) from this Accessory UI should be
enabled.

##### `plugins[]['accessory-uis'][]['accessory-details']`

Whether [accessory details components](plugins.md#accessoryuiregisteraccessorydetailscomponent) from this Accessory UI
should be enabled.

##### `plugins[]['accessory-uis'][]['collapsed-services']`

Whether [collapsed services](plugins.md#accessoryuiregistercollapsedservicescomponent) from this Accessory UI should
be enabled.

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

#### `accessories2[].uuid`

Optional. If not provided a UUID will be generated from the plugin name, accessory type and accessory name.

### `platforms2`

The `platforms2` property is an array of accessory platform configuration objects. Plugins can use any additional
properties.

`platforms2` works exactly the same as `platforms`, but uses hap-server plugins instead of Homebridge plugins.

#### `platforms2[].plugin`

The name of the plugin providing this accessory platform.

#### `platforms2[].platform`

The name of the accessory platform.

#### `platforms2[].name`

A name used to identify this accessory platform instance.

#### `platforms2[].uuid`

Optional. If not provided a UUID will be generated from the plugin name, accessory platform type and accessory
platform name. This isn't a real UUID, it's used to generate UUIDs for individual accessories.

### `automation-triggers`

An object containing automation trigger configuration objects. Keys will be used in `automations[].triggers` to add
the trigger to an automation. Plugins can use any additional properties on automation trigger configuration objects.

#### `automation-triggers[].plugin`

The name of the plugin providing this automation trigger.

#### `automation-triggers[].trigger`

The name of the automation trigger.

#### `automation-triggers[].expression`

> `!automation-triggers[].plugin && automation-triggers[].trigger === 'Cron'`

[A cron expression.](https://github.com/node-cron/node-cron#cron-syntax)

#### `automation-triggers[].timezone`

> `!automation-triggers[].plugin && automation-triggers[].trigger === 'Cron'`

The timezone to use when evaluating the cron expression.

### `automation-conditions`

An object containing automation condition configuration objects. Keys will be used in `automations[].conditions` to
add the condition to an automation. Plugins can use any additional properties on automation condition configuration
objects.

#### `automation-conditions[].plugin`

The name of the plugin providing this automation condition.

#### `automation-conditions[].condition`

The name of the automation condition.

#### `automation-conditions[].conditions`

> `!automation-conditions[].plugin && automation-conditions[].condition === 'Any' || automation-conditions[].condition === 'All'`

An array of automation condition configuration objects.

#### `automation-conditions[].script`

> `!automation-conditions[].plugin && automation-conditions[].condition === 'Script'`

A string to evalute. This can also be an array, which will be joined by newlines.

The script will be wrapped in an async function, so it can use the `await` keyword:

```json
{
    "condition": "Script",
    "script": [
        "const response = await axios.get('...');",
        "return response.data;"
    ]
}
```

### `automation-actions`

An object containing automation action configuration objects. Keys will be used in `automations[].actions` to add the
action to an automation. Plugins can use any additional properties on automation action configuration objects.

#### `automation-actions[].plugin`

The name of the plugin providing this automation action.

#### `automation-actions[].action`

The name of the automation action.

#### `automation-actions[].condition`

> `!automation-actions[].plugin && automation-actions[].action === 'Conditional'`

An automation condition configuration objects.

#### `automation-actions[].actions`

> `!automation-actions[].plugin && automation-actions[].action === 'Conditional'`

An array of automation action configuration objects.

#### `automation-actions[].script`

> `!automation-actions[].plugin && automation-actions[].condition === 'Script'`

A string to evalute. This can also be an array, which will be joined by newlines.

The script will be wrapped in an async function, so it can use the `await` keyword:

```json
{
    "condition": "Script",
    "script": [
        "const response = await axios.get('...');",
        "return response.data;"
    ]
}
```

#### `automation-actions[].characteristic`

> `!automation-actions[].plugin && automation-actions[].action === 'SetCharacteristic'`

An array containing an accessory UUID, a service UUID and a characteristic UUID, or a string containing an accessory
UUID, a service UUID and a characteristic UUID separated by dots.

#### `automation-actions[].value`

> `!automation-actions[].plugin && automation-actions[].action === 'SetCharacteristic'`

The value to set the characteristic to when running.

#### `automation-actions[].increase`

> `!automation-actions[].plugin && automation-actions[].action === 'SetCharacteristic'`

A number to increase the characteristic by when running.

#### `automation-actions[].decrease`

> `!automation-actions[].plugin && automation-actions[].action === 'SetCharacteristic'`

A number to decrease the characteristic by when running.

### `automations`

An array of automation configuration objects.

Automations can also be configured in the web interface.

#### `automations[].triggers`

An array of keys of automation triggers to add to this automation.

#### `automations[].conditions`

An array of keys of automation conditions to add to this automation.

#### `automations[].actions`

An array of keys of automation actions to add to this automation.
