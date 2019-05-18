### Storage layout

#### Persistent data

These files are created in the data directory.

- `ui-storage`
    - node-persist directory that contains hap-server data. [See hap-server storage.](#hap-server-storage)
- `assets`
    - Contains uploaded images.
- `plugin-storage/*`
    - Contains node-persist directories for each plugin.
- `persist`
    - node-persist directory that contains HAP-NodeJS data. [See hap-nodejs storage.](#hap-nodejs-storage)
- `accessories/cachedAccessories`
    - Created by Homebridge.

#### Temporary data

These files are created in the data directory when hap-server starts and are deleted when hap-server stops.

- `hap-server.pid`
    - Contains the process ID of the hap-server process.
- `hap-server-port`
    - Contains the port number of the web interface.
- `cli-token`
    - Contains a token that can be used by anyone who can read the file to authenticate to the web interface
        WebSocket server. It is used to authenticate CLI commands.

#### hap-server storage

Stored in `ui-storage` in the data directory. node-persist uses the MD5 hash of the key as the filename.

- `Home`
    - Data shared between all web interface users.
- `Layouts`
    - Contains IDs of all layouts.
- `Layout.{layout_uuid}`
    - Layout configuration.
- `LayoutSections.{layout_uuid}`
    - Contains ID of all layout sections.
- `LayoutSection.{layout_uuid}.{layout_section_uuid}`
    - Layout section configuration.
- `Automations`
    - Contains IDs of all automations.
- `Automation.{automation_uuid}`
    - Automation configuration.
- `AccessoryData.{accessory_uuid}`
    - Extra data for accessories.
- `Pairing.{username}`
    - Extra data for HAP pairings.
- `CachedAccessories`
    - Used to quickly add accessories to HAP bridges so they can start before the accessories become available.
- `Bridges`
    - Contains IDs of all bridges created in the web interface.
- `Bridge.{bridge_uuid}`
    - Bridge configuration.
- `OUI`
    - Stores the Organisationally Unique Identifier used for generating MAC addresses for new bridge usernames.

#### hap-nodejs storage

Stored in `persist` in the data directory.

- `AccessoryInfo.{username}.json`
    - HAP bridge configuration.
- `IdentifierCache.{username}.json`
    - Used to assign persistent AID/IIDs for accessories, services and characteristics.
