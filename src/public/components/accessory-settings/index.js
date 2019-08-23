import {ServiceSettingsComponents as accessory_settings_components} from '../../component-registry';

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const service = contextRequire(file);

    if (!service.uuid) continue;

    accessory_settings_components.set(service.uuid, service.default);

    console.log('Accessory settings', file, service);
}

export default accessory_settings_components;
