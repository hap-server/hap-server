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
}
