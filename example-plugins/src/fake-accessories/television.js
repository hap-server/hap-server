
import {Accessory, Service, Characteristic} from 'hap-server-api/hap-async';

export default function createAccessory(name, uuid, log) {
    // This is the Accessory that we'll return to HAP-NodeJS
    const accessory = new Accessory(name, uuid);

    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'No one')
        .setCharacteristic(Characteristic.Model, 'Fake');

    // Add the actual TV Service and listen for change events from iOS.
    // We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
    const television_service = accessory.addService(Service.Television, 'Television');

    television_service
        .setCharacteristic(Characteristic.ConfiguredName, 'Television')
        .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    television_service.getCharacteristic(Characteristic.Active)
        .on('set', async new_value => {
            log.info('set Active => setNewValue: ' + new_value);
        }); // .updateValue(Characteristic.Active.ACTIVE);

    television_service.getCharacteristic(Characteristic.ActiveIdentifier)
        .on('set', async new_value => {
            log.info('set Active Identifier => setNewValue: ' + new_value);
        })
        .updateValue(1);

    television_service.getCharacteristic(Characteristic.RemoteKey)
        .on('set', async new_value => {
            log.info('set Remote Key => setNewValue: ' + new_value);
        });

    television_service.getCharacteristic(Characteristic.PictureMode)
        .on('set', async new_value => {
            log.info('set PictureMode => setNewValue: ' + new_value);
        });

    television_service.getCharacteristic(Characteristic.PowerModeSelection)
        .on('set', async new_value => {
            log.info('set PowerModeSelection => setNewValue: ' + new_value);
        });

    // Speaker
    const speaker_service = accessory.addService(Service.TelevisionSpeaker);

    speaker_service
        .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
        .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

    speaker_service.getCharacteristic(Characteristic.VolumeSelector)
        .on('set', async new_value => {
            log.info('set VolumeSelector => setNewValue: ' + new_value);
        });

    // HDMI 1
    const input_hdmi1 = accessory.addService(Service.InputSource, 'HDMI 1', 'hdmi1');

    input_hdmi1
        .setCharacteristic(Characteristic.Identifier, 1)
        .setCharacteristic(Characteristic.ConfiguredName, 'HDMI 1')
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI);

    // HDMI 2
    const input_hdmi2 = accessory.addService(Service.InputSource, 'HDMI 2', 'hdmi2');

    input_hdmi2
        .setCharacteristic(Characteristic.Identifier, 2)
        .setCharacteristic(Characteristic.ConfiguredName, 'HDMI 2')
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI);

    // Netflix
    const input_netflix = accessory.addService(Service.InputSource, 'Netflix', 'netflix');

    input_netflix
        .setCharacteristic(Characteristic.Identifier, 3)
        .setCharacteristic(Characteristic.ConfiguredName, 'Netflix')
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);

    television_service.addLinkedService(input_hdmi1);
    television_service.addLinkedService(input_hdmi2);
    television_service.addLinkedService(input_netflix);

    return accessory;
}
