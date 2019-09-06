import {AuthenticationHandlerComponents as authentication_handler_components} from '../../component-registry';

const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const authentication_handler = contextRequire(file);

    if (!authentication_handler.id) continue;

    authentication_handler_components.set(authentication_handler.id, {
        component: authentication_handler.default,
        name: authentication_handler.name,
    });

    console.log('Authentication handler', file, authentication_handler);
}

export default authentication_handler_components;
