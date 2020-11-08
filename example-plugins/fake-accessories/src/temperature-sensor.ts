
import {Logger, AccessoryEvents} from '@hap-server/api';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Temperature Sensor');

    const sensor = accessory.addService(Service.TemperatureSensor);

    sensor.getCharacteristic(Characteristic.CurrentTemperature)
        .updateValue(50);

    // randomize our temperature reading every 3 seconds
    const interval = setInterval(() => {
        // randomize temperature to a value between 0 and 100
        const temperature = Math.round(Math.random() * 100);

        // update the characteristic value so interested iOS devices can get notified
        sensor.updateCharacteristic(Characteristic.CurrentTemperature, temperature);
    }, 3000);

    accessory.on(AccessoryEvents.DESTROY, () => {
        clearInterval(interval);
    });

    return accessory;
}
