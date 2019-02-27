homebridge-web-ui
===

Homebridge, but with a web interface for controlling and configuring accessories.

### TODO

A lot.

- [x] Basic accessory control (on/off)
    - [x] Switch
    - [x] Lightbulb
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
        - This would allow you to configure all accessories in Homebridge and then allow multiple people to create their own homes with read-only access (or no access) to other people's accessories instead of sharing a single home where everyone has permission to control all accessories
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
- [ ] Plugins
    - [ ] Accessories + accessory platforms
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
