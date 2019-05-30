
/**
 * Add get_handler and set_handler properties and helper getHandler and setHandler methods to Characteristics
 * that wrap handlers so they can return a Promise/a value.
 */

import Logger from './logger';
import {Accessory, Service, Characteristic} from 'hap-nodejs';

const log = new Logger('hap-async');

Object.defineProperty(Characteristic.prototype, 'get_handler', {
    configurable: true,
    enumerable: true,
    get() {
        return this._get_handler ? this._get_handler.handler : null;
    },
    set(handler) {
        if (this._get_handler) this.removeListener('get', this._get_handler.listener);

        if (handler) {
            const listener = async function (callback, context, connection_id) {
                try {
                    const value = await handler.call(this, context, connection_id);

                    callback(null, value);
                } catch (err) {
                    log.error('Error in get handler', this, err);
                    callback(err);
                }
            };

            this._get_handler = {handler, listener};
            this.on('get', listener);
        } else {
            this._get_handler = null;
        }
    },
});

Characteristic.prototype.getHandler = function (handler) {
    this.get_handler = handler;
    return this;
};

Object.defineProperty(Characteristic.prototype, 'set_handler', {
    configurable: true,
    enumerable: true,
    get() {
        return this._set_handler ? this._set_handler.handler : null;
    },
    set(handler) {
        if (this._set_handler) this.removeListener('set', this._set_handler.listener);

        if (handler) {
            const listener = async function (new_value, callback, context, connection_id) {
                try {
                    const value = await handler.call(this, new_value, context, connection_id);

                    callback(null, value);
                } catch (err) {
                    log.error('Error in set handler', this, err);
                    callback(err);
                }
            };

            this._set_handler = {handler, listener};
            this.on('set', listener);
        } else {
            this._set_handler = null;
        }
    },
});

Characteristic.prototype.setHandler = function (handler) {
    this.set_handler = handler;
    return this;
};
