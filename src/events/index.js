import EventEmitter from 'events';

export class Event {
    constructor(...args) {
        Object.defineProperty(this, 'emitter', {configurable: true, value: null});
        Object.defineProperty(this, 'args', {value: args});
        Object.defineProperty(this, '_throw', {writable: true, value: false});
        Object.defineProperty(this, '_returnValue', {writable: true, value: null});
    }

    static get type() {
        if (this._type) return this._type;

        // If a type hasn't been set add one now
        return this.type = Symbol('Event.' + this.name);
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

Object.defineProperty(Event.prototype, 'returnValue',
    Object.assign(Object.getOwnPropertyDescriptor(Event.prototype, 'returnValue'), {enumerable: true}));
Object.defineProperty(Event.prototype, 'throw',
    Object.assign(Object.getOwnPropertyDescriptor(Event.prototype, 'throw'), {enumerable: true}));

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

export class EventListener {
    constructor(emitter, event, handler) {
        this.emitter = emitter;
        this.event = event;
        this.handler = handler;
        this.canceled = false;
        this.groups = [];

        EventEmitter.prototype.on.call(this.emitter, this.event, this.handler);
        EventEmitter.prototype.on.call(this.emitter, 'removeListener', this.removeListenerHandler = (event, handler) => {
            if (this.event !== event || this.handler !== handler) return;

            this.canceled = true;
            this.emitter.removeListener('removeListener', this.removeListenerHandler);
        });
    }

    get listener() {
        return this.handler;
    }

    cancel() {
        this.canceled = true;
        this.emitter.removeListener(this.event, this.handler);
        this.emitter.removeListener('removeListener', this.removeListenerHandler);

        let index;
        for (const group of this.groups) {
            while ((index = group.listeners.indexOf(this)) >= 0) group.listeners.splice(index, 1);
        }
    }
}

export class EventListenerPromise extends Promise {
    constructor(emitter, event) {
        super((rs, rj) => (this.resolve = rs, this.reject = rj));

        this.emitter = emitter;
        this.event = event;
        this.handler = (...args) => (this.cancel(), this.resolve(...args));
        this.canceled = false;
        this.groups = [];

        EventEmitter.prototype.on.call(this.emitter, this.event, this.handler);
        EventEmitter.prototype.on.call(this.emitter, 'removeListener', this.removeListenerHandler = (event, handler) => {
            if (this.event !== event || this.handler !== handler) return;

            this.canceled = true;
            this.emitter.removeListener('removeListener', this.removeListenerHandler);
        });
    }

    get listener() {
        return this.handler;
    }

    cancel() {
        this.canceled = true;
        this.emitter.removeListener(this.event, this.handler);
        this.emitter.removeListener('removeListener', this.removeListenerHandler);

        let index;
        for (const group of this.groups) {
            while ((index = group.listeners.indexOf(this)) >= 0) group.listeners.splice(index, 1);
        }
    }
}

export class EventListeners {
    constructor(...listeners) {
        this.listeners = [];
        this.groups = [];

        this.add(...listeners);
    }

    add(...listeners) {
        for (const listener of listeners) {
            if (this.listeners.includes(listener)) continue;

            this.listeners.push(listener);
            listener.groups.push(this);
        }
    }

    cancel(remove_all) {
        let index;

        for (const listener of this.listeners) {
            listener.cancel();

            if (!(listener instanceof EventListeners) || remove_all) {
                while ((index = this.listeners.indexOf(listener)) >= 0) this.listeners.splice(index, 1);
            }
        }
    }
}

export default class Events extends EventEmitter {
    constructor(...args) {
        super(...args);

        Object.defineProperty(this, 'domain', {enumerable: false, writable: true, value: this.domain});
        Object.defineProperty(this, '_events', {enumerable: false, writable: true, value: this._events});
        Object.defineProperty(this, '_eventsCount', {enumerable: false, writable: true, value: this._eventsCount});
        Object.defineProperty(this, '_maxListeners', {enumerable: false, writable: true, value: this._maxListeners});

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

        if (event instanceof Event) {
            Object.defineProperty(event, 'emitter', {value: this});
        }

        if (event instanceof ExtendableEvent) {
            event.emitting++;
        }

        const handled = this._emit(event, ...data);

        if (event instanceof ExtendableEvent) {
            event.emitting--;

            return event.promise;
        }

        return handled;
    }

    _emit(event, ...data) {
        let handled = false;

        if (event instanceof Event) {
            handled = this._emit2(event.type, event, data) || handled;

            for (const type of event.types || []) {
                handled = this._emit2(type, event, data) || handled;
            }
        } else {
            handled = this._emit2(event, null, data) || handled;
        }

        if (this.parent_emitter) handled = this.parent_emitter._emit(event, ...data) || handled;

        return handled;
    }

    _emit2(type, event, args) {
        const handler = this._events[type];

        if (handler === undefined) return false;

        if (typeof handler === 'function') {
            this._emit3(handler, event, args);
        } else {
            for (const listener of handler.slice()) {
                this._emit3(listener, event, args);
            }
        }

        return true;
    }

    _emit3(handler, event, args) {
        const listener = typeof handler === 'function' ? handler : handler.listener;

        Reflect.apply(listener, this, listener.expects_hap_event && event ? [event] : args);
    }

    /**
     * Registers an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} handler
     * @param {EventListeners} [event_listeners] An EventListener group to add the listener to
     * @return {EventListener}
     */
    on(type, handler, event_listeners) {
        if (type.prototype instanceof Event) {
            type = type.type;
            handler.expects_hap_event = true;
        }

        const event_listener = new EventListener(this, type, handler);

        if (event_listeners) event_listeners.add(event_listener);

        return event_listener;
    }

    /**
     * Registers an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} [handler]
     * @return {(EventListener|EventListenerPromise<*>)}
     */
    once(type, handler) {
        if (!handler) {
            const promise = new EventListenerPromise(this, type);
            return promise;
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
