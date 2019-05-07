
import {Accessory, Service, Characteristic} from '@hap-server/api/hap-async';

export default function createAccessory(name, uuid, log) {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'No one')
        .setCharacteristic(Characteristic.Model, 'Fake');

    const garage_door = accessory.addService(Service.GarageDoorOpener, 'Garage Door');

    let opened = false;

    garage_door.getCharacteristic(Characteristic.TargetDoorState)
        .on('set', async new_value => {
            if (new_value === Characteristic.TargetDoorState.CLOSED) {
                opened = false;

                // now we want to set our lock's "actual state" to be unsecured so it shows as unlocked in iOS apps
                garage_door.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
            } else if (new_value === Characteristic.TargetDoorState.OPEN) {
                opened = true;

                // now we want to set our lock's "actual state" to be locked so it shows as open in iOS apps
                garage_door.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPEN);
            }
        });

    // We want to intercept requests for our current state so we can query the hardware itself instead of
    // allowing HAP-NodeJS to return the cached Characteristic.value.
    garage_door.getCharacteristic(Characteristic.CurrentDoorState)
        .on('get', () => {
            if (opened) {
                log.info('Are we locked? Yes.');
                return Characteristic.CurrentDoorState.OPEN;
            } else {
                log.info('Are we locked? No.');
                return Characteristic.CurrentDoorState.CLOSED;
            }
        });

    return accessory;
}
