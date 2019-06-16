Example configuration
---

Run the web server on port `8082`.

```json
{
    "listen": 8082
}
```

Load plugins (or a plugin) from `../example-plugins/dist` and store data in the same directory as this configuration file.

```json
{
    "plugin-path": [
        "../example-plugins/dist"
    ],
    "data-path": "."
}
```

Configure Homebridge accessories. This is passed directly to Homebridge.

```json
{
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "031-45-154"
    },

    "accessories": [
        "Homebridge accessory platforms here"
    ],

    "platforms": [
        "Homebridge platforms here"
    ]
}
```

Configure a HAP bridge and add the accessory `Switch #1`.

```json
{
    "bridges": [
        {
            "name": "Bridge #2",
            "username": "00:00:00:00:00:02",
            "pin": "031-45-154",
            "accessories": [
                ["virtual-switches", "VirtualSwitch", "Switch #1"]
            ],
            "port": 8081
        }
    ],
}
```

Configure two fake accessories - a VirtualSwitch accessory and a Television accessory.

```json
{
    "accessories2": [
        {
            "plugin": "virtual-switches",
            "accessory": "VirtualSwitch",
            "name": "Switch #1"
        },
        {
            "plugin": "fake-accessories",
            "accessory": "Television",
            "name": "Television"
        }
    ]
}
```

Configure a VirtualSwitches accessory platform.

```json
{
    "platforms2": [
        {
            "plugin": "virtual-switches",
            "platform": "VirtualSwitches",
            "switches": [
                "Switch #2",
                "Switch #3",
                "Switch #4"
            ]
        }
    ]
}
```
