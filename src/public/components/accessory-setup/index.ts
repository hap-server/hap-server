import {AccessorySetupComponents as accessory_setup_components} from '../../component-registry';

// @ts-ignore
const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const accessory_setup = contextRequire(file);

    if (!accessory_setup.hasOwnProperty('id')) continue;

    accessory_setup_components.set(accessory_setup.id, {
        component: accessory_setup.default,
        name: accessory_setup.name,
        manual: accessory_setup.manual || false,
    });

    console.log('Accessory setup', file, accessory_setup);
}

export default accessory_setup_components;
