
import {AccessoryEvents, Logger} from '@hap-server/api';
import {Accessory, Service, Characteristic} from '@hap-server/api/hap';
import {random} from './util';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Motion Sensor');

    let motion_detected = !!Math.round(Math.random());

    const sensor = accessory.addService(Service.MotionSensor);

    sensor.getCharacteristic(Characteristic.MotionDetected)
        .onGet(() => {
            log.info('Getting motion detection state');
            return motion_detected;
        })
        .updateValue(motion_detected);

    let timeout: NodeJS.Timeout | null = null;

    const setMotionDetectedTimer = () => {
        clearTimeout(timeout!);
        timeout = setTimeout(() => {
            sensor.getCharacteristic(Characteristic.MotionDetected).updateValue(motion_detected = true);
            setMotionNotDetectedTimer();
        }, random(/* 30 seconds */ 30000, /* 10 minutes */ 600000));
    };
    const setMotionNotDetectedTimer = () => {
        clearTimeout(timeout!);
        timeout = setTimeout(() => {
            sensor.getCharacteristic(Characteristic.MotionDetected).updateValue(motion_detected = false);
            setMotionDetectedTimer();
        }, random(/* 5 seconds */ 5000, /* 1 minute */ 60000));
    };

    if (motion_detected) setMotionNotDetectedTimer();
    else setMotionDetectedTimer();

    accessory.on(AccessoryEvents.DESTROY, () => {
        clearTimeout(timeout!);
        timeout = null;
    });

    return accessory;
}
