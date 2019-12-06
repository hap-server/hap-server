import {ServiceTileComponents as service_components} from '../../component-registry';
import {PluginAPI} from '../../plugins';

// @ts-ignore
const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const service = contextRequire(file);

    if (!service.uuid) continue;

    service_components.set(service.uuid, service.default);

    console.log('Service tile', file, service);
}

PluginAPI.refreshDisplayServices();

export default service_components;
