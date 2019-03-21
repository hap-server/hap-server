const service_components = new Map();

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const service = contextRequire(file);

    if (!service.uuid) continue;

    service_components.set(service.uuid, service.default);

    console.log('Service tile', file, service);
}

export default service_components;
