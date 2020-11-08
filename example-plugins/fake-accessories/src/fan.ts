
import {Logger} from '@hap-server/api';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Fan');

    let on = false;
    let rotation_speed = 0;
    /** 0 = clockwise, 1 = counter clockwise */
    let rotation_direction: 0 | 1 = 0;
    let lock_controls = false;

    const fan = accessory.addService(Service.Fanv2);

    fan.getCharacteristic(Characteristic.Active)
        .onGet(() => {
            log.info('Getting power state');
            return on ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting power state to %O', value);
            on = value === Characteristic.Active.ACTIVE;
        })
        .updateValue(on ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);

    fan.getCharacteristic(Characteristic.RotationSpeed)
        .onGet(() => {
            log.info('Getting rotation speed');
            return rotation_speed;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting rotation speed to %O', value);
            rotation_speed = value;
        })
        .updateValue(rotation_speed);

    fan.getCharacteristic(Characteristic.RotationDirection)
        .onGet(() => {
            log.info('Getting rotation direction');
            return rotation_direction;
        })
        // @ts-expect-error
        .onSet((value: 0 | 1) => {
            log.info('Setting rotation direction to %O', value);
            rotation_direction = value;
        })
        .updateValue(rotation_direction);

    fan.getCharacteristic(Characteristic.LockPhysicalControls)
        .onGet(() => {
            log.info('Getting physical control lock state');
            return lock_controls ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED :
                Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting physical control lock state to %O', value);
            lock_controls = value === Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
        })
        .updateValue(lock_controls ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED :
            Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED);

    return accessory;
}
