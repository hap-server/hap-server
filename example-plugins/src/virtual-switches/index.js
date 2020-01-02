
// Module will be patched to add a virtual "homebridge-api" module
// "homebridge-api/storage" is a node-persist instance (will be configured and initialised automatically)
// "homebridge-api/hap" is hap-nodejs (hap-server adds the getHandler and setHandler methods of Characteristics)

import hapserver, {log, WebInterfacePlugin, AccessorySetup, AccessoryEvents, AccessoryStatus} from '@hap-server/api';
import storage from '@hap-server/api/storage';
import {Accessory, Service, Characteristic, uuid} from '@hap-server/api/hap';
import path from 'path';

import globalconfig from '@hap-server/api/plugin-config';

log.info('Virtual Switches global config', globalconfig);

//

hapserver.registerAccessory('VirtualSwitch', async config => {
    const accessory = new Accessory(config.name, config.uuid);
    const _log = log.withPrefix(config.name);

    const initial_state = await storage.getItem('VirtualSwitch.' + config.uuid);

    // Set accessory information
    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'Samuel Elliott')
        .setCharacteristic(Characteristic.Model, 'Virtual Switch')
        .setCharacteristic(Characteristic.SerialNumber, config.uuid);

    // Handle identify requests
    accessory.on('identify', async paired => {
        _log.info('Identify');
    });

    // Add the Switch service
    const switch_service = accessory.addService(Service.Switch);
    switch_service.getCharacteristic(Characteristic.On)
        .setHandler(async value => {
            await storage.setItem('VirtualSwitch.' + config.uuid, value);

            _log.info('Switch', config.name, 'is now', value ? 'on' : 'off');
        })
        .updateValue(initial_state);

    _log.info('Switch', config.name, 'is', initial_state ? 'on' : 'off');

    // _log.info(accessory, switch_service);

    accessory.on(AccessoryEvents.RELOAD, new_config => {
        log.info('Updating configuration', config, new_config);

        if (config.name !== new_config.name) {
            config.name = new_config.name;
            accessory.displayName = new_config.name;
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Name, new_config.name);
        }
    });

    return accessory;
});

const createAccessory = async (name, config, __log) => {
    const switch_uuid = uuid.generate(config.uuid + ':' + name);

    const accessory = new Accessory(name, switch_uuid);
    const _log = __log.withPrefix(name);

    const initial_state = await storage.getItem('VirtualSwitch.' + switch_uuid);

    // Set accessory information
    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'Samuel Elliott')
        .setCharacteristic(Characteristic.Model, 'Virtual Switch')
        .setCharacteristic(Characteristic.SerialNumber, switch_uuid);

    // Handle identify requests
    accessory.on('identify', async paired => {
        _log.info('Identify');
    });

    // Add the Switch service
    const switch_service = accessory.addService(Service.Switch);
    switch_service.getCharacteristic(Characteristic.On)
        .setHandler(async value => {
            await storage.setItem('VirtualSwitch.' + switch_uuid, value);

            _log.info('Switch', name, 'is now', value ? 'on' : 'off');
        })
        .updateValue(initial_state);

    _log.info('Switch', name, 'is', initial_state ? 'on' : 'off');

    // _log.info(accessory, switch_service);

    return accessory;
};

hapserver.registerDynamicAccessoryPlatform('VirtualSwitches', async (accessory_platform, config) => {
    const __log = log.withPrefix(config.name);

    const switches = await Promise.all(config.switches.map(name => createAccessory(name, config, __log)));

    accessory_platform.onreload = async function(new_config) {
        __log.info('Updating configuration', config, new_config);

        for (const switch_name of new_config.switches) {
            const switch_uuid = uuid.generate(config.uuid + ':' + name);
            const existing = switches.find(s => s.UUID === switch_uuid);

            if (!existing) {
                // This switch doesn't exist
                // Create it
                const accessory = await createAccessory(switch_name, config, __log);
                accessory_platform.addAccessory(accessory);
                switches.push(accessory);
                log.info('Added accessory', switch_name);
            } else {
                // Switches don't have any configuration
                // Nothing to do here
            }
        }

        for (const accessory of switches) {
            // Switch still exists (or was just created)
            const switch_name = new_config.switches
                .find(name => accessory.UUID === uuid.generate(config.uuid + ':' + name));
            if (switch_name) continue;

            // Switch doesn't exist anymore
            // Remove it
            accessory_platform.removeAccessory(accessory);
            switches.splice(switches.indexOf(accessory), 1);
            log.info('Removed accessory', switch_name);
        }

        config.switches = new_config.switches;
    };

    return switches;
});

const accessory_setup = new AccessorySetup('VirtualSwitch');
hapserver.registerAccessorySetup(accessory_setup);

const ui = new WebInterfacePlugin();

ui.static('/ui', path.join(__dirname, 'ui'));
ui.loadScript('/ui/index.js');

hapserver.registerWebInterfacePlugin(ui);
