import {UserManagementHandlers as user_management_components} from '../../component-registry';

// @ts-ignore
const contextRequire = require.context('.', true, /\.vue$/);

for (const file of contextRequire.keys()) {
    const user_management = contextRequire(file);

    if (!user_management.hasOwnProperty('id')) continue;

    user_management_components.set(user_management.id, user_management.default);

    console.log('User management', file, user_management);
}

export default user_management_components;
