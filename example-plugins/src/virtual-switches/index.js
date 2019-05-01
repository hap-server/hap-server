
// Module will be patched to add a virtual "homebridge-api" module
// "homebridge-api/storage" is a node-persist instance (will be configured and initialised automatically)
// "homebridge-api/hap" is hap-nodejs
// "homebridge-api/hap-async" has the Accessory, Service and Characteristic classes from hap-nodejs but uses Promises instead of callbacks

import hapserver, {log} from '@hap-server/api';
import storage from '@hap-server/api/storage';
import {uuid} from '@hap-server/api/hap';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap-async';

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
        .on('set', async value => {
            await storage.setItem('VirtualSwitch.' + config.uuid, value);

            _log.info('Switch', config.name, 'is now', value ? 'on' : 'off');
        })
        .updateValue(initial_state);

    _log.info('Switch', config.name, 'is', initial_state ? 'on' : 'off');

    // _log.info(accessory, switch_service);

    return accessory;
});

hapserver.registerAccessoryPlatform('VirtualSwitches', config => {
    const __log = log.withPrefix(config.name);

    return Promise.all(config.switches.map(async name => {
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
            .on('set', async value => {
                await storage.setItem('VirtualSwitch.' + switch_uuid, value);

                _log.info('Switch', name, 'is now', value ? 'on' : 'off');
            })
            .updateValue(initial_state);

        _log.info('Switch', name, 'is', initial_state ? 'on' : 'off');

        // _log.info(accessory, switch_service);

        return accessory;
    }));
});
