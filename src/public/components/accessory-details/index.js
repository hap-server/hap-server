const accessory_details_components = new Map();

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const service = contextRequire(file);

    if (!service.uuid) continue;

    accessory_details_components.set(service.uuid, service.default);

    console.log(file, service);
}

export default accessory_details_components;
