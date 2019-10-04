import path from 'path';
import os from 'os';

import {connect, log} from '.';

export const command = 'make-admin <user>';
export const describe = 'Get characteristics';

export function builder(yargs) {
    yargs.positional('user', {
        describe: 'The ID of the user to promote to administrator',
        type: 'string',
    });
    yargs.option('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });
}

export async function handler(argv) {
    // eslint-disable-next-line no-unused-vars
    const {connection, authenticated_user, config, config_path, data_path, server_pid} = await connect(argv);

    const permissions = (await connection.getUsersPermissions(argv.user))[0] || {};

    permissions['*'] = true;

    await connection.setUserPermissions(argv.user, permissions);

    log.info('%s is now an administrator', argv.user);

    connection.ws.close();
}
