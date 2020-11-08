
import {Logger, ExternalAccessorySymbol} from '@hap-server/api';
import {Accessory, Service, Characteristic, Categories as Category} from '@hap-server/api/hap';

export default function createAccessory(name: string, uuid: string, log: Logger): Accessory {
    // This is the Accessory that we'll return to HAP-NodeJS
    const accessory = new Accessory(name, uuid);

    // Since iOS 14 Televisions can't be bridged at all to show properly
    accessory[ExternalAccessorySymbol] = true;

    // The category is only used for external accessories (accessories published outside of a bridge)
    // hap-server detects this automatically anyway, so you don't really need to set it
    accessory.category = Category.TELEVISION;

    accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, 'hap-server example accessories')
        .setCharacteristic(Characteristic.Model, 'Television');

    // Add the actual TV Service and listen for change events from iOS.
    // We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
    const television_service = accessory.addService(Service.Television, 'Television');

    television_service
        .updateCharacteristic(Characteristic.ConfiguredName, 'Television')
        .updateCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    television_service.getCharacteristic(Characteristic.Active)
        .onSet(async new_value => {
            log.info('set Active => setNewValue: ' + new_value);
        }); // .updateValue(Characteristic.Active.ACTIVE);

    television_service.getCharacteristic(Characteristic.ActiveIdentifier)
        .setProps({
            // ActiveIdentifer === one InputSource's Identifier
            validValues: [1, 2, 3],
        })
        .onSet(async new_value => {
            log.info('set Active Identifier => setNewValue: ' + new_value);
        })
        .updateValue(1);

    television_service.getCharacteristic(Characteristic.RemoteKey)
        .setProps({
            validValues: [
                // Set supported remote keys
                Characteristic.RemoteKey.ARROW_UP,
                Characteristic.RemoteKey.ARROW_DOWN,
                Characteristic.RemoteKey.ARROW_LEFT,
                Characteristic.RemoteKey.ARROW_RIGHT,
                Characteristic.RemoteKey.SELECT,
                Characteristic.RemoteKey.BACK,
            ],
        })
        .onSet(async new_value => {
            log.info('set Remote Key => setNewValue: ' + new_value);
        });

    television_service.getCharacteristic(Characteristic.PictureMode)
        .onSet(async new_value => {
            log.info('set PictureMode => setNewValue: ' + new_value);
        });

    television_service.getCharacteristic(Characteristic.PowerModeSelection)
        .onSet(async new_value => {
            log.info('set PowerModeSelection => setNewValue: ' + new_value);
        });

    // Speaker
    const speaker_service = accessory.addService(Service.TelevisionSpeaker);

    speaker_service
        .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
        .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

    speaker_service.getCharacteristic(Characteristic.VolumeSelector)
        .onSet(async new_value => {
            log.info('set VolumeSelector => setNewValue: ' + new_value);
        });

    // HDMI 1
    const input_hdmi1 = accessory.addService(Service.InputSource, 'HDMI 1', 'hdmi1');

    input_hdmi1
        .updateCharacteristic(Characteristic.Identifier, 1)
        .updateCharacteristic(Characteristic.ConfiguredName, 'HDMI 1')
        .updateCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .updateCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI);

    // HDMI 2
    const input_hdmi2 = accessory.addService(Service.InputSource, 'HDMI 2', 'hdmi2');

    input_hdmi2
        .updateCharacteristic(Characteristic.Identifier, 2)
        .updateCharacteristic(Characteristic.ConfiguredName, 'HDMI 2')
        .updateCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .updateCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI);

    // Netflix
    const input_netflix = accessory.addService(Service.InputSource, 'Netflix', 'netflix');

    input_netflix
        .updateCharacteristic(Characteristic.Identifier, 3)
        .updateCharacteristic(Characteristic.ConfiguredName, 'Netflix')
        .updateCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .updateCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);

    television_service.addLinkedService(input_hdmi1);
    television_service.addLinkedService(input_hdmi2);
    television_service.addLinkedService(input_netflix);

    return accessory;
}
