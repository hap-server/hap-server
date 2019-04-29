
import hapserver, {log} from '@hap-server/api';

import createTelevisionAccessory from './television';

hapserver.registerAccessory('Television', async config => {
    return createTelevisionAccessory(config.name, config.uuid, log.withPrefix(config.name));
});
