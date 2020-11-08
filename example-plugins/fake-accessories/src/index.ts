
import hapserver, {log} from '@hap-server/api';

import createFanAccessory from './fan';
import createGarageDoorAccessory from './garage-door';
import createLightbulbAccessory from './lightbulb';
import createLockAccessory from './lock';
import createMotionSensorAccessory from './motion-sensor';
import createOutletAccessory from './outlet';
import createSwitchAccessory from './switch';
import createTelevisionAccessory from './television';
import createTemperatureSensorAccessory from './temperature-sensor';

hapserver.registerAccessory('Fan', async config => {
    return createFanAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('GarageDoor', async config => {
    return createGarageDoorAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('Lightbulb', async config => {
    return createLightbulbAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('Lock', async config => {
    return createLockAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('MotionSensor', async config => {
    return createMotionSensorAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('Outlet', async config => {
    return createOutletAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('Switch', async config => {
    return createSwitchAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('Television', async config => {
    return createTelevisionAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
hapserver.registerAccessory('TemperatureSensor', async config => {
    return createTemperatureSensorAccessory(config.name, config.uuid!, log.withPrefix(config.name));
});
