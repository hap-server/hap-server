
import {AccessoryHandler, AccessoryPlatform} from '../server/plugins';

import HAPIP from './hap-ip';

export const builtin_accessory_types: {
    [key: string]: AccessoryHandler,
} = {
    // HomeKitBLE: HAPBLE,
};

export const builtin_accessory_platforms: {
    [key: string]: typeof AccessoryPlatform,
} = {
    HomeKitIP: HAPIP,
};
