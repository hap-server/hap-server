import {connect, log, GlobalArguments} from '.';

import {HttpClient} from 'hap-controller';
import read from 'read';
import util from 'util';
const prompt = util.promisify(read);

export const command = 'hap-pair <host> <port>';
export const describe = 'Pair with a HomeKit accessory';

export function builder(yargs: typeof import('yargs')) {
    yargs.positional('host', {
        describe: 'The hostname/IP address of the HomeKit accessory',
        type: 'string',
        required: true,
    });
    yargs.positional('port', {
        describe: 'The port of the HomeKit accessory\'s HAP server',
        type: 'number',
        required: true,
    });
}

interface Arguments extends GlobalArguments {
    host: string;
    port: number;
}

export async function handler(argv: Arguments) {
    const setup_code = await prompt({
        prompt: `Setup code for ${argv.host}: `,
        // silent: true,
    });

    const client = new HttpClient('', argv.host, argv.port);

    await client.pairSetup(setup_code);
    log.info('Successfully paired', JSON.stringify(client.getLongTermData(), null, 4));
}
