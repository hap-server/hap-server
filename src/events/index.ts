import EventEmitter from 'events';

export class Event {
    emitter: Events;
    protected args: any[];
    private _throw: boolean;
    private _returnValue: any;

    private static _type: string | symbol;

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

    get type(): string | symbol {
        return (this.constructor as any).type;
    }

    get types(): Array<string | symbol> {
        return (this.constructor as any).types;
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
    emitting: number;
    private _promise: Promise<any> | null;

    constructor(...args: any) {
        super(...args);

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

interface EventListenersInterface {
    cancel(): void;
}

interface EventListenerInterface extends EventListenersInterface {
    emitter: Events;
    event: Event | string;
    handler: (...args: any[]) => void;
    canceled: boolean;
    groups: EventListeners[];
}

export class EventListener implements EventListenerInterface {
    emitter: Events;
    event: Event | string;
    handler: (...args: any[]) => void;
    canceled: boolean;
    groups: EventListeners[];

    removeListenerHandler: (...args: any[]) => void;

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

    get domain() {
        return this.emitter.domain;
    }
    get _events() {
        return this.emitter._events;
    }
    get _eventsCount() {
        return this.emitter._eventsCount;
    }
    get _maxListeners() {
        return this.emitter._maxListeners;
    }
    get parent_emitter() {
        return this.emitter.parent_emitter;
    }
    addListener(event, listener) {
        return this.emitter.addListener(event, listener);
    }
    on(type, listener, event_listeners) {
        return this.emitter.on(type, listener, event_listeners);
    }
    once(type, listener) {
        return this.emitter.once(type, listener);
    }
    prependListener(type, listener) {
        return this.emitter.prependListener(type, listener);
    }
    prependOnceListener(type, listener) {
        return this.emitter.prependOnceListener(type, listener);
    }
    removeListener(type, listener) {
        return this.emitter.removeListener(type, listener);
    }
    off(type, listener) {
        return this.emitter.off(type, listener);
    }
    removeAllListeners(type) {
        return this.emitter.removeAllListeners(type);
    }
    setMaxListeners(max_listeners) {
        return this.emitter.setMaxListeners(max_listeners);
    }
    getMaxListeners() {
        return this.emitter.getMaxListeners();
    }
    listeners(type) {
        return this.emitter.listeners(type);
    }
    rawListeners(type) {
        return this.emitter.rawListeners(type);
    }
    emit(type, ...args) {
        return this.emitter.emit(type, ...args);
    }
    eventNames() {
        return this.emitter.eventNames();
    }
    listenerCount(type) {
        return this.emitter.listenerCount(type);
    }
}

export class EventListenerPromise<T> extends Promise<T> implements EventListenerInterface {
    emitter: Events;
    event: Event | string;
    handler: (...args: any[]) => void;
    canceled: boolean;
    groups: EventListeners[];

    resolve: (value: T) => void;
    reject: (value: any) => void;

    removeListenerHandler: (...args: any[]) => void;

    constructor(emitter, event) {
        super((rs, rj) => (this.resolve = rs, this.reject = rj));

        this.emitter = emitter;
        this.event = event;
        this.handler = value => (this.cancel(), this.resolve(value));
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

export class EventListeners implements EventListenersInterface {
    // listeners: EventListener[] | EventListenerPromise[] | EventListeners[];
    listeners: Array<EventListenerInterface | EventListeners>;
    groups: EventListeners[];

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

    cancel(remove_all?) {
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
    domain: any;
    _events: any;
    _eventsCount: any;
    _maxListeners: any;

    parent_emitter: Events | null;

    constructor() {
        super();

        Object.defineProperty(this, 'domain', {enumerable: false, writable: true, value: this.domain});
        Object.defineProperty(this, '_events', {enumerable: false, writable: true, value: this._events});
        Object.defineProperty(this, '_eventsCount', {enumerable: false, writable: true, value: this._eventsCount});
        Object.defineProperty(this, '_maxListeners', {enumerable: false, writable: true, value: this._maxListeners});

        Object.defineProperty(this, 'parent_emitter', {configurable: true, writable: true, value: null});
    }

    /**
     * Emits an event.
     *
     * @param {(function|Event|string)} event A class that extends Event, an Event or a string
     * @param {*} [...data]
     * @return {(Promise|boolean)} A promise that resolves when all event handlers finish if the event is an ExtendableEvent
     */
    emit(event, ...data: any) {
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

    private _emit(event, ...data) {
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

    private _emit2(type, event, args) {
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

    private _emit3(handler, event, args) {
        const listener = typeof handler === 'function' ? handler : handler.listener;

        Reflect.apply(listener, this, listener.expects_hap_event && event ? [event] : args);
    }

    on(type: string | symbol, handler, event_listeners?: EventListeners): this
    on<T>(type: new (...args) => T, handler: (event: T, ...args: any[]) => void, event_listeners?: EventListeners): this
    on(type, listener?, event_listeners?: EventListeners): this {
        this.listen(type, listener, event_listeners);
        return this;
    }

    /**
     * Registers an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} handler
     * @param {EventListeners} [event_listeners] An EventListener group to add the listener to
     * @return {EventListener}
     */
    listen(type: string | symbol, handler, event_listeners?: EventListeners): EventListener
    listen<T>(type: new (...args) => T, handler: (event: T, ...args: any[]) => void, event_listeners?: EventListeners): EventListener
    listen(type, handler?, event_listeners?: EventListeners): EventListener {
        if (type.prototype instanceof Event) {
            type = type.type;
            handler.expects_hap_event = true;
        }

        const event_listener = new EventListener(this, type, handler);

        if (event_listeners instanceof EventListeners) event_listeners.add(event_listener);

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

        return EventEmitter.prototype.once.call(this, type, handler);
    }

    /**
     * Unregisters an event listener.
     *
     * @param {(function|string)} type A class that extends Event or a string
     * @param {function} listener
     * @return {Events}
     */
    removeListener(type, listener) {
        if (type.prototype instanceof Event) {
            type = type.type;
        }

        return EventEmitter.prototype.removeListener.call(this, type, listener);
    }
}
