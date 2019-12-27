import {LayoutSectionComponents as section_components} from '../../component-registry';

// @ts-ignore
const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const section = contextRequire(file);

    if (!section.type) continue;

    section_components.set(section.type, {
        component: section.default,
        name: section.name,
    });

    console.log('Section components', file, section);
}

export default section_components;
