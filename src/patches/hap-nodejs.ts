/// <reference path="../types/hap-nodejs.d.ts" />

//
// Patches HAPServer to properly authenticate requests
//
// This was fixed in v0.5.2, but we can't update hap-nodejs until Homebridge does.
// This also adds the controller's pairing identifier (clientUsername) to the session.
//
// https://github.com/samuelthomas2774/HAP-NodeJS/commit/0e71d1f193b5453abc222f4552475bb817ba0d55
//

import {IncomingMessage, ServerResponse} from 'http';

import Logger from '../common/logger';

import {HAPServer} from 'hap-nodejs/lib/HAPServer';
import {Session} from 'hap-nodejs/lib/util/eventedhttp';
import * as tlv from 'hap-nodejs/lib/util/tlv';
import * as encryption from 'hap-nodejs/lib/util/encryption';
import {HKDF} from 'hap-nodejs/lib/util/hkdf';
import * as tweetnacl from 'tweetnacl';

const log = new Logger('hap-nodejs', 'HAPServer');

declare module 'hap-nodejs/lib/util/eventedhttp' {
    interface Session {
        authenticated?: boolean;
        clientUsername?: string;
    }
}

// @ts-ignore
HAPServer.prototype._handlePairVerifyStepTwo = function(
    request: IncomingMessage, response: ServerResponse, session: Session, events: Record<string, true>,
    objects: Record<number, Buffer>
) {
    const encryptedData = objects[HAPServer.Types.ENCRYPTED_DATA];

    const messageData = Buffer.alloc(encryptedData.length - 16);
    const authTagData = Buffer.alloc(16);
    encryptedData.copy(messageData, 0, 0, encryptedData.length - 16);
    encryptedData.copy(authTagData, 0, encryptedData.length - 16, encryptedData.length);

    const plaintextBuffer = Buffer.alloc(messageData.length);

    // instance of HAPEncryption (created in handlePairVerifyStepOne)
    const enc = session.encryption!;

    if (!encryption.verifyAndDecrypt(
        enc.hkdfPairEncKey, Buffer.from('PV-Msg03'), messageData, authTagData, null, plaintextBuffer
    )) {
        log.debug('[%s] M3: Invalid signature', this.accessoryInfo.username);

        response.writeHead(200, {'Content-Type': 'application/pairing+tlv8'});
        response.end(tlv.encode(
            HAPServer.Types.ERROR_CODE, HAPServer.Codes.INVALID_REQUEST
        ));

        return;
    }

    const decoded = tlv.decode(plaintextBuffer);
    const clientUsername = decoded[HAPServer.Types.USERNAME];
    const proof = decoded[HAPServer.Types.PROOF];

    const material = Buffer.concat([enc.clientPublicKey, clientUsername, enc.publicKey]);

    // since we're paired, we should have the public key stored for this client
    const clientPublicKey = this.accessoryInfo.getClientPublicKey(clientUsername.toString());

    // if we're not actually paired, then there's nothing to verify - this client thinks it's paired with us but we
    // disagree. Respond with invalid request (seems to match HomeKit Accessory Simulator behavior)
    if (!clientPublicKey) {
        log.debug('[%s] Client %s attempting to verify, but we are not paired; rejecting client',
            this.accessoryInfo.username, clientUsername);

        response.writeHead(200, {'Content-Type': 'application/pairing+tlv8'});
        response.end(tlv.encode(
            HAPServer.Types.ERROR_CODE, HAPServer.Codes.INVALID_REQUEST
        ));

        return;
    }

    if (!tweetnacl.sign.detached.verify(material, proof, clientPublicKey)) {
        log.debug('[%s] Client %s provided an invalid signature', this.accessoryInfo.username, clientUsername);

        response.writeHead(200, {'Content-Type': 'application/pairing+tlv8'});
        response.end(tlv.encode(
            HAPServer.Types.ERROR_CODE, HAPServer.Codes.INVALID_REQUEST
        ));

        return;
    }

    log.debug('[%s] Client %s verification complete', this.accessoryInfo.username, clientUsername);

    session.authenticated = true;
    session.clientUsername = clientUsername.toString();

    response.writeHead(200, {'Content-Type': 'application/pairing+tlv8'});
    response.end(tlv.encode(
        HAPServer.Types.SEQUENCE_NUM, 0x04
    ));

    // now that the client has been verified, we must "upgrade" our pesudo-HTTP connection to include
    // TCP-level encryption. We'll do this by adding some more encryption vars to the session, and using them
    // in future calls to onEncrypt, onDecrypt.

    const encSalt = Buffer.from('Control-Salt');
    const infoRead = Buffer.from('Control-Read-Encryption-Key');
    const infoWrite = Buffer.from('Control-Write-Encryption-Key');

    // eslint-disable-next-line new-cap
    enc.accessoryToControllerKey = HKDF('sha512', encSalt, enc.sharedSec, infoRead, 32);
    // eslint-disable-next-line new-cap
    enc.controllerToAccessoryKey = HKDF('sha512', encSalt, enc.sharedSec, infoWrite, 32);

    // Our connection is now completely setup. We now want to subscribe this connection to special
    // "keepalive" events for detecting when connections are closed by the client.
    events.keepalive = true;
};

// @ts-ignore
const _handlePairings = HAPServer.prototype._handlePairings;
// @ts-ignore
HAPServer.prototype._handlePairings = function(
    request: IncomingMessage, response: ServerResponse, session: Session, events: Record<string, true>,
    requestData: Buffer
) {
    if (!this.allowInsecureRequest && !session.authenticated) {
        response.writeHead(401, {'Content-Type': 'application/hap+json'});
        response.end(JSON.stringify({status: HAPServer.Status.INSUFFICIENT_PRIVILEGES}));

        return;
    }

    // eslint-disable-next-line prefer-rest-params
    return _handlePairings.apply(this, arguments);
};

// @ts-ignore
const _handleAccessories = HAPServer.prototype._handleAccessories;
// @ts-ignore
HAPServer.prototype._handleAccessories = function(
    request: IncomingMessage, response: ServerResponse, session: Session, events: Record<string, true>,
    requestData: Buffer
) {
    if (!this.allowInsecureRequest && !session.authenticated) {
        response.writeHead(401, {'Content-Type': 'application/hap+json'});
        response.end(JSON.stringify({status: HAPServer.Status.INSUFFICIENT_PRIVILEGES}));

        return;
    }

    // eslint-disable-next-line prefer-rest-params
    return _handleAccessories.apply(this, arguments);
};

// @ts-ignore
const _handleCharacteristics = HAPServer.prototype._handleCharacteristics;
// @ts-ignore
HAPServer.prototype._handleCharacteristics = function(
    request: IncomingMessage, response: ServerResponse, session: Session, events: Record<string, true>,
    requestData: Buffer
) {
    if (!(request.method !== 'PUT' && this.allowInsecureRequest) && !session.authenticated) {
        response.writeHead(401, {'Content-Type': 'application/hap+json'});
        response.end(JSON.stringify({status: HAPServer.Status.INSUFFICIENT_PRIVILEGES}));

        return;
    }

    // eslint-disable-next-line prefer-rest-params
    return _handleCharacteristics.apply(this, arguments);
};

// @ts-ignore
const _handleResource = HAPServer.prototype._handleResource;
// @ts-ignore
HAPServer.prototype._handleResource = function(
    request: IncomingMessage, response: ServerResponse, session: Session, events: Record<string, true>,
    requestData: Buffer
) {
    if (!this.allowInsecureRequest && !session.authenticated) {
        response.writeHead(401, {'Content-Type': 'application/hap+json'});
        response.end(JSON.stringify({status: HAPServer.Status.INSUFFICIENT_PRIVILEGES}));

        return;
    }

    // eslint-disable-next-line prefer-rest-params
    return _handleResource.apply(this, arguments);
};
