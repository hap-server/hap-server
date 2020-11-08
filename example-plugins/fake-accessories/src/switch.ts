
import {Logger} from '@hap-server/api';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Switch');

    let on = false;

    const switch_service = accessory.addService(Service.Switch);

    switch_service.getCharacteristic(Characteristic.On)
        .onGet(() => {
            log.info('Getting power state');
            return on;
        })
        // @ts-expect-error
        .onSet((value: boolean) => {
            log.info('Setting power state to %O', value);
            on = value;
        })
        .updateValue(on);

    return accessory;
}
