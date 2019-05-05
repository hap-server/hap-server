
import hapserver, {log} from '@hap-server/api';

import createTelevisionAccessory from './television';

hapserver.registerAccessory('Television', async config => {
    return createTelevisionAccessory(config.name, config.uuid, log.withPrefix(config.name));
});

import createLockAccessory from './lock';

hapserver.registerAccessory('Lock', async config => {
    return createLockAccessory(config.name, config.uuid, log.withPrefix(config.name));
});

import createGarageDoorAccessory from './garage-door';

hapserver.registerAccessory('GarageDoor', async config => {
    return createGarageDoorAccessory(config.name, config.uuid, log.withPrefix(config.name));
});
