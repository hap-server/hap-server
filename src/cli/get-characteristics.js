import path from 'path';
import os from 'os';

import {connect, log} from '.';

export const command = 'get-characteristics <config> <characteristics>';
export const describe = 'Get characteristics';

export function builder(yargs) {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: path.join(os.homedir(), '.homebridge', 'config.json'),
    });
    yargs.positional('characteristics', {
        describe: 'Dot separated accessory, service and characteristic UUIDs to get',
        type: 'array',
    });
}

export async function handler(argv) {
    // eslint-disable-next-line no-unused-vars
    const [connection, authenticated_user, config, config_path, data_path, server_pid] = await connect(argv);

    const characteristic_uuids = [argv.characteristics].concat(argv._.slice(1));

    const characteristics = await connection.getCharacteristics(...characteristic_uuids.map((uuid, index) => {
        const accessory_uuid = uuid.substr(0, uuid.indexOf('.'));
        const service_uuid = uuid.substr(uuid.indexOf('.') + 1, uuid.lastIndexOf('.') - uuid.indexOf('.') - 1);
        const characteristic_uuid = uuid.substr(uuid.lastIndexOf('.') + 1);

        log.withPrefix(`Characteristic #${index + 1}`).debug('UUID', [accessory_uuid, service_uuid, characteristic_uuid]);
        return [accessory_uuid, service_uuid, characteristic_uuid];
    }));

    // eslint-disable-next-line guard-for-in
    for (const index in characteristics) {
        const characteristic = characteristics[index];

        log.withPrefix(`Characteristic #${parseInt(index) + 1}`).debug(characteristic);
        log.withPrefix(`Characteristic #${parseInt(index) + 1}`).info((characteristic.description || 'Value') + ':', characteristic.value);
    }

    connection.ws.close();
}
