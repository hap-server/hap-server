import EventEmitter from 'events';

export class Event {
    constructor(...args) {
        Object.defineProperty(this, 'args', {value: args});
        Object.defineProperty(this, '_throw', {value: false});
        Object.defineProperty(this, '_returnValue', {value: null});
    }

    static get type() {
        if (this._type) return this._type;

        // If a type hasn't been set add one now
        this.type = Symbol('Event.' + this.name);
    }
    static set type(value) {
        // Don't allow the type to be set multiple times so it can't be changed after any listeners have been added
        // for this event
        Object.defineProperty(this, '_type', {value});
    }

    get type() {
        return this.constructor.type;
    }

    get types() {
        return this.constructor.types;
    }

    get returnValue() {
        return this._throw ? undefined : this._returnValue;
    }
    set returnValue(returnValue) {
        this._throw = false;
        this._returnValue = returnValue;
    }

    get throw() {
        return this._throw ? this._returnValue : undefined;
    }
    set throw(returnValue) {
        this._throw = true;
        this._returnValue = returnValue;
    }

    get value() {
        if (this._throw) throw this._returnValue;
        return this._returnValue;
    }
}

export class ExtendableEvent extends Event {
    constructor(args) {
        super();

        this.emitting = 0;
        this._promise = null;
    }

    waitUntil(promise) {
        if (!this.emitting) throw new Error('ExtendableEvent.prototype.waitUntil called outside an event handler');

        this._promise = Promise.all([this.promise, promise.then(() => null, () => null)]).then(() => null);
    }

    get promise() {
        return Promise.all([this._promise]).then(() => this.value);
    }
}

export default class Events extends EventEmitter {
    constructor(...args) {
        super(...args);

        Object.defineProperty(this, 'parent_emitter', {configurable: true, writable: true});
    }

    /**
     * Emits an event.
     *
     * @param {(function|Event|string)} event A class that extends Event, an Event or a string
     * @param {*} [...data]
     * @return {(Promise|boolean)} A promise that resolves when all event handlers finish if the event is an ExtendableEvent
     */
    emit(event, ...data) {
        if (event.prototype instanceof Event) {
            event = new event(...data); // eslint-disable-line new-cap
        }

        if (event instanceof ExtendableEvent) {
            event.emitting++;
        }

        if (!this._events || !this._events[event instanceof Event ? event.type : event]) {
            const handled = this.parent_emitter ? this.parent_emitter.emit(event, ...data) : false;

            if (event instanceof ExtendableEvent) {
                event.emitting--;

                return Promise.resolve(handled);
            }

            return handled;
        }

        if (event instanceof Event) {
            this._emit(event.type, event, data);

            for (const type of event.types || []) {
                this._emit(type, event, data);
            }
        } else {
            this._emit(event, null, data);
        }

        const handled = this.parent_emitter ? this.parent_emitter.emit(event, ...data) : false;

        if (event instanceof ExtendableEvent) {
            event.emitting--;

            return event.promise;
        }

        return handled;
    }

    _emit(type, event, args) {
        const handler = this._events[type];

        if (handler === undefined) return false;

        if (typeof handler === 'function') {
            this._emit2(handler, event, args);
        } else {
            for (const listener of handler.slice()) {
                this._emit2(listener, event, args);
            }
        }

        return true;
    }

    _emit2(handler, event, args) {
        const listener = typeof handler === 'function' ? handler : handler.listener;

        Reflect.apply(listener, this, listener.expects_hap_event && event ? [event] : args);
    }

    /**
     * Registers an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} handler
     */
    on(type, handler) {
        if (type.prototype instanceof Event) {
            type = type.type;
            handler.expects_hap_event = true;
        }

        EventEmitter.prototype.on.call(this, type, handler);
    }

    /**
     * Registers an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} [handler]
     */
    once(type, handler) {
        if (!handler) {
            return new Promise(resolve => {
                this.once(type, resolve);
            });
        }

        if (type.prototype instanceof Event) {
            type = type.type;
            handler.expects_hap_event = true;
        }

        EventEmitter.prototype.once.call(this, type, handler);
    }

    /**
     * Unregisters an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} handler
     */
    removeListener(type, handler) {
        if (type.prototype instanceof Event) {
            type = type.type;
        }

        EventEmitter.prototype.removeListener.call(this, type, handler);
    }
}

// Use require instead of import so this isn't hoisted and run before the Event class is defined
require('./automation-trigger');
require('./characteristic-update');
