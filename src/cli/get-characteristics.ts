import * as path from 'path';
import * as os from 'os';

import {connect, log, GlobalArguments} from '.';
import {getDefaultConfigPath} from './configuration';

export const command = 'get-characteristics <config> <characteristics>';
export const describe = 'Get characteristics';

export function builder(yargs: typeof import('yargs')) {
    yargs.positional('config', {
        describe: 'The configuration file to use',
        type: 'string',
        default: getDefaultConfigPath(process.platform, [
            path.join(os.homedir(), '.homebridge'),
        ]),
    });
    yargs.positional('characteristics', {
        describe: 'Dot separated accessory, service and characteristic UUIDs to get',
        type: 'string',
    });
}

interface Arguments extends GlobalArguments {
    config: string;
    characteristics: string;
}

export async function handler(argv: Arguments) {
    // eslint-disable-next-line no-unused-vars
    const {connection, authenticated_user, config, config_path, data_path, server_pid} = await connect(argv);

    const characteristic_uuids = [argv.characteristics].concat(argv._.slice(1));

    const characteristics = await connection.getCharacteristics(...characteristic_uuids.map((uuid, index) => {
        const accessory_uuid: string = uuid.substr(0, uuid.indexOf('.'));
        const service_uuid: string = uuid.substr(uuid.indexOf('.') + 1, uuid.lastIndexOf('.') - uuid.indexOf('.') - 1);
        const characteristic_uuid: string = uuid.substr(uuid.lastIndexOf('.') + 1);

        log.withPrefix(`Characteristic #${index + 1}`)
            .debug('UUID', [accessory_uuid, service_uuid, characteristic_uuid]);
        return [accessory_uuid, service_uuid, characteristic_uuid] as any;
    }));

    // eslint-disable-next-line guard-for-in
    for (const index in characteristics) {
        const characteristic = characteristics[index];

        log.withPrefix(`Characteristic #${parseInt(index) + 1}`).debug(characteristic);
        log.withPrefix(`Characteristic #${parseInt(index) + 1}`)
            .info((characteristic.description || 'Value') + ':', characteristic.value);
    }

    connection.ws.close();
}
