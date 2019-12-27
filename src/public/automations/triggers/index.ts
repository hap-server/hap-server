import {AutomationTriggerComponents as trigger_components} from '../../component-registry';

// @ts-ignore
const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const trigger = contextRequire(file);

    if (!trigger.type) continue;

    trigger_components.push({
        component: trigger.default,
        plugin: null,
        type: trigger.type,
        name: trigger.name,
    });

    console.log('Automation trigger component', file, trigger);
}
