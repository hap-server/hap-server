import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';

import express from 'express';
import WebSocket from 'ws';

import Connection from './connection';

export default class Server {
    constructor(homebridge, log, storage) {
        this.homebridge = homebridge;
        this.log = log;
        this.storage = storage;

        this.app = express();
        this.app.use(express.static(path.resolve(__dirname, '..', 'public')));

        this.wss = new WebSocket.Server({ noServer: true });
        this.wss.on('connection', ws => this.handleWebsocketConnection(ws));

        this.handle = this.handle.bind(this);
        this.upgrade = this.upgrade.bind(this);

        this.handleCharacteristicUpdate = this.handleCharacteristicUpdate.bind(this);

        this.homebridge._bridge.on('service-characteristic-change', event => {
            // this.log.info('Updating characteristic', event);
            this.handleCharacteristicUpdate(event.accessory || this.homebridge._bridge, event.service, event.characteristic, event.newValue, event.oldValue, event.context);
        });

        for (let accessory of this.homebridge._bridge.bridgedAccessories) {
            accessory.on('service-characteristic-change', event => {
                // this.log.info('Updating characteristic', accessory, event);
                this.handleCharacteristicUpdate(event.accessory || accessory, event.service, event.characteristic, event.newValue, event.oldValue, event.context);
            });
        }

        const addBridgedAccessory = this.homebridge._bridge.addBridgedAccessory;
        this.homebridge._bridge.addBridgedAccessory = (accessory, defer_update, ...args) => {
            accessory.on('service-characteristic-change', event => {
                // this.log.info('Updating characteristic', accessory, event);
                this.handleCharacteristicUpdate(event.accessory || accessory, event.service, event.characteristic, event.newValue, event.oldValue, event.context);
            });

            return addBridgedAccessory.call(this.homebridge._bridge, accessory, defer_update, ...args);
        };

        const console_log = console.log;
        const console_error = console.error;

        console.log = (data, ...args) => {
            for (let ws of this.wss.clients) {
                const connection = Connection.getConnectionForWebSocket(ws);
                if (connection && connection.enable_proxy_stdout)
                    ws.send('**:' + JSON.stringify({type: 'stdout', data: data + '\n'}));
            }

            console_log(data, ...args);
        };
        console.error = (data, ...args) => {
            for (let ws of this.wss.clients) {
                const connection = Connection.getConnectionForWebSocket(ws);
                if (connection && connection.enable_proxy_stdout)
                    ws.send('**:' + JSON.stringify({type: 'stderr', data: data + '\n'}));
            }

            console_error(data, ...args);
        };
    }

    createServer(options) {
        const server = http.createServer(this.handle, options);

        server.on('upgrade', this.upgrade);

        return server;
    }

    createSecureServer(options) {
        const server = https.createServer(this.handle, options);

        server.on('upgrade', this.upgrade);

        return server;
    }

    handle(req, res, next) {
        if (url.parse(req.url).pathname === '/websocket') {
            // If path is /websocket tell the client to upgrade the request
            const body = http.STATUS_CODES[426];

            res.writeHead(426, {
                'Content-Length': body.length,
                'Content-Type': 'text/plain',
            });

            res.end(body);
        } else {
            // Send all other requests to Express
            this.app.handle(req, res, next);
        }
    }

    upgrade(request, socket, head) {
        if (url.parse(request.url).pathname !== '/websocket') {
            socket.destroy();
        }

        this.wss.handleUpgrade(request, socket, head, ws => {
            this.wss.emit('connection', ws, request);
        });
    }

    handleWebsocketConnection(ws) {
        const connection = new Connection(this, ws);
    }

    /**
     * Sends a broadcast message.
     *
     * @param {any} data
     * @param {Array} except An array of WebSocket clients to not send the message to
     */
    sendBroadcast(data, except) {
        const message = '**:' + JSON.stringify(data);

        for (let ws of this.wss.clients) {
            if (ws.readyState !== WebSocket.OPEN) continue;
            if (except && except === ws || except instanceof Array && except.includes(ws)) continue;

            ws.send(message);
        }
    }

    handleCharacteristicUpdate(accessory, service, characteristic, value, old_value, context) {
        this.sendBroadcast({
            type: 'update-characteristic',
            accessory_uuid: accessory.UUID,
            service_id: service.UUID + (service.subtype ? '.' + service.subtype : ''),
            characteristic_id: characteristic.UUID,
            details: characteristic.toHAP(),
        });
    }
}
