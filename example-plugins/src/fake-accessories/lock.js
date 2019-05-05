
import {Accessory, Service, Characteristic} from '@hap-server/api/hap-async';

export default function createAccessory(name, uuid, log) {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'No one')
        .setCharacteristic(Characteristic.Model, 'Fake');

    const lock_mechanism = accessory.addService(Service.LockMechanism, 'Lock');

    let locked = false;

    lock_mechanism.getCharacteristic(Characteristic.LockTargetState)
        .on('set', async new_value => {
            if (value === Characteristic.LockTargetState.UNSECURED) {
                locked = false;

                // now we want to set our lock's "actual state" to be unsecured so it shows as unlocked in iOS apps
                lock_mechanism.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED);
            } else if (value === Characteristic.LockTargetState.SECURED) {
                locked = true;

                // now we want to set our lock's "actual state" to be locked so it shows as open in iOS apps
                lock_mechanism.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
            }
        });

    // We want to intercept requests for our current state so we can query the hardware itself instead of
    // allowing HAP-NodeJS to return the cached Characteristic.value.
    lock_mechanism.getCharacteristic(Characteristic.LockCurrentState)
        .on('get', () => {
            if (locked) {
                log.info('Are we locked? Yes.');
                return Characteristic.LockCurrentState.SECURED;
            } else {
                log.info('Are we locked? No.');
                return Characteristic.LockCurrentState.UNSECURED;
            }
        });

    return accessory;
}
