import * as path from 'path';
import * as os from 'os';

import {connect, log, GlobalArguments} from '.';
import {getDefaultConfigPath} from './configuration';

export const command = 'make-admin <user>';
export const describe = 'Get characteristics';

export function builder(yargs: typeof import('yargs')) {
    yargs.positional('user', {
        describe: 'The ID of the user to promote to administrator',
        type: 'string',
    });
    yargs.option('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: getDefaultConfigPath(process.platform, [
            path.join(os.homedir(), '.homebridge'),
        ]),
    });
}

interface Arguments extends GlobalArguments {
    user?: string;
    config: string;
}

export async function handler(argv: Arguments) {
    if (!argv.user) throw new Error('Unknown user');

    // eslint-disable-next-line no-unused-vars
    const {connection, authenticated_user, config, config_path, data_path, server_pid} = await connect(argv);

    const permissions = (await connection.getUsersPermissions(argv.user))[0] || {};

    // @ts-ignore
    permissions['*'] = true;

    await connection.setUserPermissions(argv.user, permissions);

    log.info('%s is now an administrator', argv.user);

    connection.ws.close();
}
