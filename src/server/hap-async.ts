
/**
 * Add get_handler and set_handler properties and helper getHandler and setHandler methods to Characteristics
 * that wrap handlers so they can return a Promise/a value instead of using a callback.
 */

import Logger from '../common/logger';
import {Characteristic} from 'hap-nodejs';

type GetCharacteristicHandler = (this: HAPNodeJS.Characteristic, context?: any, connection_id?: string) => Promise<any> | any;
type SetCharacteristicHandler = (this: HAPNodeJS.Characteristic, new_value: any, context?: any, connection_id?: string) => Promise<void> | void;

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace HAPNodeJS {
    interface Characteristic {
        get_handler?: GetCharacteristicHandler;
        getHandler(handler?: GetCharacteristicHandler): this;
        // private _get_handler?: {
        //     handler: GetCharacteristicHandler;
        //     listener: (callback: (err, value) => void, context?, connection_id?: string) => void;
        // };
        set_handler?: SetCharacteristicHandler;
        setHandler(handler?: SetCharacteristicHandler): this;
        // private _set_handler?: {
        //     handler: SetCharacteristicHandler;
        //     listener: (new_value, callback: (err, value) => void, context?, connection_id?: string) => void;
        // };
    }
}

const log = new Logger('hap-async');

Object.defineProperty(Characteristic.prototype, 'get_handler', {
    configurable: true,
    enumerable: true,
    get(): GetCharacteristicHandler {
        return this._get_handler ? this._get_handler.handler : null;
    },
    set(handler?: GetCharacteristicHandler) {
        if (this._get_handler) this.removeListener('get', this._get_handler.listener);

        if (handler) {
            const listener = async function(this: HAPNodeJS.Characteristic,
                callback: (err, value) => void, context?: any, connection_id?: string
            ) {
                try {
                    const value = await handler.call(this, context, connection_id); // eslint-disable-line no-invalid-this

                    callback(null, value);
                } catch (err) {
                    log.error('Error in get handler', this, err); // eslint-disable-line no-invalid-this
                    callback(err, null);
                }
            };

            this._get_handler = {handler, listener};
            this.on('get', listener);
        } else {
            this._get_handler = null;
        }
    },
});

(Characteristic.prototype as HAPNodeJS.Characteristic).getHandler = function(this: HAPNodeJS.Characteristic,
    handler?: GetCharacteristicHandler
) {
    this.get_handler = handler;
    return this;
};

Object.defineProperty(Characteristic.prototype, 'set_handler', {
    configurable: true,
    enumerable: true,
    get() {
        return this._set_handler ? this._set_handler.handler : null;
    },
    set(handler?: SetCharacteristicHandler) {
        if (this._set_handler) this.removeListener('set', this._set_handler.listener);

        if (handler) {
            const listener = async function(this: HAPNodeJS.Characteristic,
                new_value, callback: (err, value) => void, context?: any, connection_id?: string
            ) {
                try {
                    const value = await handler.call(this, new_value, context, connection_id); // eslint-disable-line no-invalid-this

                    callback(null, value);
                } catch (err) {
                    log.error('Error in set handler', this, err); // eslint-disable-line no-invalid-this
                    callback(err, null);
                }
            };

            this._set_handler = {handler, listener};
            this.on('set', listener);
        } else {
            this._set_handler = null;
        }
    },
});

(Characteristic.prototype as HAPNodeJS.Characteristic).setHandler = function(this: HAPNodeJS.Characteristic,
    handler?: SetCharacteristicHandler
) {
    this.set_handler = handler;
    return this;
};
