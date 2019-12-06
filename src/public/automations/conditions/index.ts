import {AutomationConditionComponents as condition_components} from '../../component-registry';

// @ts-ignore
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
