const icon_components = new Map<string, any>();

// @ts-ignore
const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const icon_module = contextRequire(file);

    icon_components.set(file, icon_module);
}

export default icon_components;
