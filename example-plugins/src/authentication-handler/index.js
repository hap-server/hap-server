/* eslint no-throw-literal: 'off' */

import hapserver, {AuthenticatedUser, AccessoryUI, log} from '@hap-server/api';
import storage from '@hap-server/api/storage';

import bcrypt from 'bcrypt';

const hashPassword = (password, rounds) => new Promise((rs, rj) => bcrypt.hash(password, rounds || 10, (err, hash) => err ? rj(err) : rs(hash)));
const comparePassword = (password, hash) => new Promise((rs, rj) => bcrypt.hash(password, hash, (err, result) => err ? rj(err) : rs(result)));

// eslint-disable-next-line no-unused-vars
const checkPassword = (password, hash) => comparePassword(password, hash).then(result => {
    if (!result) throw new Error('Password does not match the hash.');
});

const authenticated_users = new Set();

hapserver.registerAuthenticationHandler('LocalStorage', async (request, previous_user) => {
    // The first function receives any data sent from the UI
    // If a user is already authenticated the AuthenticatedUser object will be passed as the second object
    // It can return/throw anything to be sent back to the UI
    // When a user successfully authenticates it should return an AuthenticatedUser object

    log.info('Authentication request', request, previous_user);

    const validation_errors = {};

    if (!request.username) validation_errors.username = 'Enter your username.';
    if (!request.password) validation_errors.password = 'Enter your password.';

    if (Object.keys(validation_errors).length) {
        validation_errors.validation = true;
        throw validation_errors;
    }

    const user = await storage.getItem(request.username);

    try {
        if (!user || !user.password_hash) {
            log.info('New user password', await hashPassword(request.password));
            throw {validation: true, username: 'Incorrect username/password.'};
        }

        if (!await comparePassword(request.password, user.password_hash)) {
            throw {validation: true, username: 'Incorrect username/password.'};
        }
    } finally {
        await storage.setItem(request.username, Object.assign(user || {}, {
            last_login: Date.now(),
        }));
    }

    const authenticated_user = new AuthenticatedUser(user.id, user.name || request.username);

    if (request.remember) await authenticated_user.enableReauthentication();

    authenticated_users.add(authenticated_user);

    return authenticated_user;
}, (authenticated_user, disconnected) => {
    // The second function is called when an authenticated user disconnects or is reauthenticated
    // It doesn't need to return anything (it's return value is ignored)

    authenticated_users.delete(authenticated_user);

    log.info('User', authenticated_user, disconnected ? 'disconnected' : 'reauthenticated');
});

const authentication_handler_ui = new AccessoryUI();

authentication_handler_ui.loadScript('/ui.js');
authentication_handler_ui.static('/', __dirname);

hapserver.registerAccessoryUI(authentication_handler_ui);
