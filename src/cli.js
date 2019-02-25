import path from 'path';

import persist from 'node-persist';

import {Server} from '.';

const storage = persist.create({
    dir: path.resolve(__dirname, '..', 'data'),
    stringify: data => JSON.stringify(data, null, 4),
});

(async () => {
    await storage.init();

    const server = new Server(storage);
    const http_server = server.createServer();

    http_server.listen(8080);
})();
