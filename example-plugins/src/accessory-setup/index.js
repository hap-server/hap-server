import hapserver, {AccessoryDiscovery, DiscoveredAccessory, AccessorySetup, AccessoryUI} from '@hap-server/api';
import {Accessory} from '@hap-server/api/hap';

//
// Register the accessory
//

hapserver.registerAccessory('Accessory', config => {
    return new Accessory(config.name, config.uuid);
});

//
// Register the accessory setup handler
//

// const setup = new AccessorySetup('Accessory', .., /* plugin_name */ 'other-plugin');
// const setup = new AccessorySetup(AccessoryPlatformHandler, ...);
const setup = new AccessorySetup('Accessory', data => {
    // Send the request data back
    return data;
});

hapserver.registerAccessorySetup(setup);

//
// Register the accessory discovery handler
//

const discovery = new AccessoryDiscovery(setup);

discovery.onstart = () => {
    discovery.addAccessory(new DiscoveredAccessory({
        name: 'Test',
    }));
};
discovery.onstop = () => {};

hapserver.registerAccessoryDiscovery(discovery);

//
// Register an accessory UI that registers the accessory setup + discovery components
//

const ui = new AccessoryUI();

ui.loadScript('/ui.js');
ui.static('/', __dirname);

hapserver.registerAccessoryUI(ui);
