
import {Logger} from '@hap-server/api';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap';
import {sleep} from './util';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Garage Door');

    const garage_door = accessory.addService(Service.GarageDoorOpener, 'Garage Door');

    let opened = false;

    garage_door.getCharacteristic(Characteristic.TargetDoorState)
        .onSet(async new_value => {
            if (new_value === Characteristic.TargetDoorState.CLOSED) {
                opened = false;

                garage_door.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSING);

                // Wait five seconds
                await sleep(5000);

                // now we want to set our lock's "actual state" to be unsecured so it shows as unlocked in iOS apps
                garage_door.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
            } else if (new_value === Characteristic.TargetDoorState.OPEN) {
                opened = true;

                garage_door.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPENING);

                // Wait five seconds
                await sleep(5000);

                // now we want to set our lock's "actual state" to be locked so it shows as open in iOS apps
                garage_door.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPEN);
            }
        });

    // We want to intercept requests for our current state so we can query the hardware itself instead of
    // allowing HAP-NodeJS to return the cached Characteristic.value.
    garage_door.getCharacteristic(Characteristic.CurrentDoorState)
        .onGet(() => {
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
