
/* eslint prefer-rest-params: 'off' */

import EventEmitter from 'events';
import {Accessory, Service, Characteristic} from 'hap-nodejs';
import {once} from 'hap-nodejs/lib/util/once';

function debug(...args) {
    console.debug(...args);
}

class AsyncAccessory extends Accessory {
    addService(service) {
        if (typeof service === 'function') {
            service = new (Function.prototype.bind.apply(service, arguments));

            service.__proto__ = AsyncService.prototype;
        }

        return Accessory.prototype.addService.call(this, service);
    }

    _identificationRequest(paired, callback) {
        debug('[%s] Identification request', this.displayName);

        let _return;
        if (!callback) _return = new Promise((rs, rj) => callback = (err, data) => err ? rj(err) : rs(data));

        if (this.listeners('identify').length > 0) {
            // allow implementors to identify this Accessory in whatever way is appropriate, and pass along
            // the standard callback for completion.
            this.emit('identify', paired, callback).then(callback);
        } else {
            debug('[%s] Identification request ignored; no listeners to \'identify\' event', this.displayName);
            callback();
        }

        return _return;
    }

    _handleResource(data, callback) {
        let _return;
        if (!callback) _return = new Promise((rs, rj) => callback = (err, data) => err ? rj(err) : rs(data));

        Accessory.prototype._handleResource.call(this, data, callback);

        return _return;
    }

    emit() {
        return AsyncEventEmitter.prototype.emit.apply(this, arguments);
    }

    once() {
        return AsyncEventEmitter.prototype.once.apply(this, arguments);
    }
}

class AsyncBridge extends AsyncAccessory {
    constructor(...args) {
        super(...args);

        this._isBridge = true;
    }
}

class AsyncService extends Service {
    addCharacteristic(characteristic) {
        if (typeof characteristic === 'function') {
            characteristic = new (Function.prototype.bind.apply(characteristic, arguments));

            characteristic.__proto__ = AsyncCharacteristic.prototype;
        }

        return Service.prototype.addCharacteristic.call(this, characteristic);
    }

    addOptionalCharacteristic(characteristic) {
        // characteristic might be a constructor like `Characteristic.Brightness` instead of an instance
        // of Characteristic. Coerce if necessary.
        if (typeof characteristic === 'function') {
            characteristic = new (Function.prototype.bind.apply(characteristic, arguments));

            characteristic.__proto__ = AsyncCharacteristic.prototype;
        }

        return Service.prototype.addOptionalCharacteristic(this, characteristic);
    }

    getCharacteristic(name) {
        const characteristic = Service.prototype.getCharacteristic.call(this, name);

        if (characteristic) characteristic.__proto__ = AsyncCharacteristic.prototype;

        return characteristic;
    }

    emit() {
        return AsyncEventEmitter.prototype.emit.apply(this, arguments);
    }

    once() {
        return AsyncEventEmitter.prototype.once.apply(this, arguments);
    }
}

class AsyncCharacteristic extends Characteristic {
    getValue(callback, context, connectionID) {
        if (arguments.length <= 2) {
            connectionID = context;
            context = callback;
            callback = undefined;
        }

        let _return;
        if (!callback) _return = new Promise((rs, rj) => callback = (err, data) => err ? rj(err) : rs(data));

        // Handle special event only characteristics
        if (this.eventOnlyCharacteristic === true) {
            if (callback) callback(null, null);

            return _return;
        }

        if (this.listeners('get').length > 0) {
            // Allow a listener to handle the fetching of this value, and wait for completion
            const cb = once((err, newValue) => {
                this.status = err;

                if (err) {
                    // Pass the error along to our callback
                    if (callback) callback(err);
                } else {
                    // validateValue returns a value that has be cooerced into a valid value
                    newValue = this.validateValue(newValue);

                    if (newValue === undefined || newValue === null) {
                        newValue = this.getDefaultValue();
                    }

                    // Getting the value was a success; we can pass it along and also update our cached value
                    const oldValue = this.value;
                    this.value = newValue;
                    if (callback) callback(null, newValue);

                    // Emit a change event if necessary
                    if (oldValue !== newValue) {
                        this.emit('change', {oldValue, newValue, context});
                    }
                }
            });

            this.emit('get', cb, context, connectionID)
                .then(r => (r = r.find(r => r)) ? undefined : cb(null, r)).catch(cb);
        } else {
            // No one is listening to the 'get' event, so just return the cached value
            if (callback) callback(this.status, this.value);
        }

        return _return;
    }

    setValue(newValue, callback, context, connectionID) {
        if (arguments.length <= 3) {
            connectionID = context;
            context = callback;
            callback = undefined;
        }

        let _return;
        if (!callback) _return = new Promise((rs, rj) => callback = (err, data) => err ? rj(err) : rs(data));

        if (newValue instanceof Error) {
            this.status = newValue;
        } else {
            this.status = null;
        }

        // validateValue returns a value that has be cooerced into a valid value
        newValue = this.validateValue(newValue);

        if (this.listeners('set').length > 0) {
            // Allow a listener to handle the setting of this value, and wait for completion
            const cb = once(err => {
                this.status = err;

                if (err) {
                    // Pass the error along to our callback
                    if (callback) callback(err);
                } else {
                    if (newValue === undefined || newValue === null) {
                        newValue = this.getDefaultValue();
                    }

                    // Setting the value was a success; so we can cache it now
                    const oldValue = this.value;
                    this.value = newValue;
                    if (callback) callback();

                    if (this.eventOnlyCharacteristic === true || oldValue !== newValue) {
                        this.emit('change', {oldValue, newValue, context});
                    }
                }
            });

            this.emit('set', newValue, cb, context, connectionID).then(r => cb()).catch(cb);
        } else {
            if (newValue === undefined || newValue === null) {
                newValue = this.getDefaultValue();
            }

            // No one is listening to the 'set' event, so just assign the value blindly
            const oldValue = this.value;
            this.value = newValue;
            if (callback) callback();

            if (this.eventOnlyCharacteristic === true || oldValue !== newValue) {
                this.emit('change', {oldValue, newValue, context});
            }
        }

        return _return || this;
    }

    updateValue(newValue, callback, context) {
        if (arguments.length <= 2) {
            context = callback;
            callback = undefined;
        }

        let _return;
        if (!callback) _return = new Promise((rs, rj) => callback = (err, data) => err ? rj(err) : rs(data));

        if (newValue instanceof Error) {
            this.status = newValue;
        } else {
            this.status = null;
        }

        // validateValue returns a value that has be cooerced into a valid value
        newValue = this.validateValue(newValue);

        if (newValue === undefined || newValue === null) {
            newValue = this.getDefaultValue();
        }

        // No one is listening to the 'set' event, so just assign the value blindly
        const oldValue = this.value;
        this.value = newValue;
        if (callback) callback();

        if (this.eventOnlyCharacteristic === true || oldValue !== newValue) {
            this.emit('change', {oldValue, newValue, context});
        }

        return _return || this;
    }

    emit() {
        return AsyncEventEmitter.prototype.emit.apply(this, arguments);
    }

    once() {
        return AsyncEventEmitter.prototype.once.apply(this, arguments);
    }
}

export {
    AsyncAccessory as Accessory,
    AsyncBridge as Bridge,
    AsyncService as Service,
    AsyncCharacteristic as Characteristic,
};

/**
 * Extends Node.js' EventEmitter to call event listeners asyncronously.
 */
export class AsyncEventEmitter extends EventEmitter {
    /**
     * Emits an event.
     * @param {string} event The event to emit
     * @param {*} ...data Data to be passed to event listeners
     * @return {Promise}
     */
    emit(event, ...data) {
        let listeners = this._events && this._events[event] || [];
        listeners = Array.isArray(listeners) ? listeners : [listeners];

        // Special treatment of internal newListener and removeListener events
        if (event === 'newListener' || event === 'removeListener') {
            data = [{
                event: data,
                fn: err => {
                    if (err) throw err;
                },
            }];
        }

        const promises = [];

        for (const listener of listeners) {
            try {
                const r = listener.apply(this, data);

                if (r instanceof Promise) promises.push(r);
            } catch (err) {}
        }

        return Promise.all(promises);
    }

    /**
     * Adds an event listener that will be removed when it is called and therefore only be called once.
     * If a callback is not specified a promise that is resolved once the event is emitted is returned.
     *
     * @param {string} event
     * @param {function} callback
     * @return {?Promise<*>}
     */
    once(event, callback) {
        if (callback) {
            // If a callback was specified add this event as normal
            return EventEmitter.prototype.once.apply(this, arguments);
        }

        // Otherwise return a promise that is resolved once this event is emitted
        return new Promise((resolve, reject) => {
            EventEmitter.prototype.once.call(this, event, data => {
                return resolve(data);
            });
        });
    }
}
