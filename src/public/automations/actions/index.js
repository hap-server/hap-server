import {action_components} from '..';

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const action = contextRequire(file);

    if (!action.type) continue;

    action_components.push({
        component: action.default,
        plugin: null,
        type: action.type,
        name: action.name,
    });

    console.log('Automation action component', file, action);
}
