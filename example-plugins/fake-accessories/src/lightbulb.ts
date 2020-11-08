
import {Logger} from '@hap-server/api';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap';
import {
    AmbientLightningController as AmbientLightingController,
} from 'hap-nodejs/dist/lib/controller/AmbientLightningController';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Lightbulb');

    let on = false;
    let brightness = 100;
    let colour_temperature = 0;
    let hue = 0;
    let saturation = 0;

    const lightbulb = accessory.addService(Service.Lightbulb);

    lightbulb.getCharacteristic(Characteristic.On)
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

    lightbulb.getCharacteristic(Characteristic.Brightness)
        .onGet(() => {
            log.info('Getting brightness');
            return brightness;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting brightness to %O', value);
            brightness = value;
        })
        .updateValue(brightness);

    lightbulb.getCharacteristic(Characteristic.ColorTemperature)
        .onGet(() => {
            log.info('Getting colour temperature');
            return colour_temperature;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting colour temperature to %O', value);
            colour_temperature = value;
        })
        .updateValue(colour_temperature);

    lightbulb.getCharacteristic(Characteristic.Hue)
        .onGet(() => {
            log.info('Getting hue');
            return hue;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting hue to %O', value);
            hue = value;
        })
        .updateValue(hue);

    lightbulb.getCharacteristic(Characteristic.Saturation)
        .onGet(() => {
            log.info('Getting saturation');
            return saturation;
        })
        // @ts-expect-error
        .onSet((value: number) => {
            log.info('Setting saturation to %O', value);
            saturation = value;
        })
        .updateValue(saturation);

    const ambient_lighting_controller = new AmbientLightingController(lightbulb);
    accessory.configureController(ambient_lighting_controller);

    return accessory;
}
