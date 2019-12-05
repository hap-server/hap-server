import path from 'path';
import os from 'os';

import {connect, log, GlobalArguments} from '.';

export const command = 'set-characteristic <config> <characteristic> <value>';
export const describe = 'Set a characteristic';

export function builder(yargs: typeof import('yargs')) {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });
    yargs.positional('characteristic', {
        describe: 'Dot separated accessory, service and characteristic UUID',
        type: 'string',
    });
    yargs.positional('value', {
        describe: 'The new value',
        type: 'string',
    });
}

interface Arguments extends GlobalArguments {
    config: string;
    characteristic: string;
    value: string;
}

export async function handler(argv: Arguments) {
    // eslint-disable-next-line no-unused-vars
    const {connection, authenticated_user, config, config_path, data_path, server_pid} = await connect(argv);

    const uuid = argv.characteristic;
    const accessory_uuid = uuid.substr(0, uuid.indexOf('.'));
    const service_uuid = uuid.substr(uuid.indexOf('.') + 1, uuid.lastIndexOf('.') - uuid.indexOf('.') - 1);
    const characteristic_uuid = uuid.substr(uuid.lastIndexOf('.') + 1);

    log.withPrefix('Characteristic').debug('UUID', [accessory_uuid, service_uuid, characteristic_uuid]);

    const [characteristic] = (await connection.getCharacteristics([accessory_uuid, service_uuid, characteristic_uuid]));

    log.withPrefix('Characteristic').debug(characteristic);
    log.withPrefix('Characteristic').info((characteristic.description || 'Value') + ':', characteristic.value);

    const formatted_value = characteristic.format === 'bool' ? argv.value.match(/(t|y)/i) ? true : false
        : argv.value;

    log.withPrefix('Characteristic').info('Setting value to', {value: argv.value, formatted_value});

    const response = await connection.setCharacteristic(accessory_uuid, service_uuid, characteristic_uuid,
        formatted_value);

    log.withPrefix('Characteristic').debug('Response', response);

    connection.ws.close();
}
