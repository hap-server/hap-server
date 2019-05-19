const accessory_discovery_components = new Map();

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const accessory_discovery = contextRequire(file);

    if (!accessory_discovery.hasOwnProperty('id')) continue;

    accessory_discovery_components.set(accessory_discovery.id, {
        component: accessory_discovery.default,
        setup_handler: accessory_discovery.setup_handler,
    });

    console.log('Accessory discovery', file, accessory_discovery);
}

export default accessory_discovery_components;
