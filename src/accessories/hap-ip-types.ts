
import {Service, Characteristic} from '../hap-nodejs';

export const IID = Symbol('IID');
export const ServiceMap = Symbol('ServiceMap');
export const CharacteristicMap = Symbol('CharacteristicMap');

declare module 'hap-nodejs/lib/Accessory' {
    interface Accessory {
        [IID]?: number;
        [ServiceMap]?: Map</** iid */ number, Service>;
        [CharacteristicMap]?: Map</** iid */ number, Characteristic>;
    }
}

declare module 'hap-nodejs/lib/Service' {
    interface Service {
        [IID]?: number;
        [ServiceMap]?: Map</** iid */ number, Service>;
        [CharacteristicMap]?: Map</** iid */ number, Characteristic>;
    }
}

declare module 'hap-nodejs/lib/Characteristic' {
    interface Characteristic {
        [IID]?: number;
        [ServiceMap]?: Map</** iid */ number, Service>;
        [CharacteristicMap]?: Map</** iid */ number, Characteristic>;
    }
}
