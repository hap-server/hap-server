import {condition_components} from '..';

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const condition = contextRequire(file);

    if (!condition.type) continue;

    condition_components.push({
        component: condition.default,
        plugin: null,
        type: condition.type,
        name: condition.name,
    });

    console.log('Automation condition component', file, condition);
}
