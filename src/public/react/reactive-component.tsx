import TypedEventEmitter, {EventMap, EventListener} from '../../events/typed-eventemitter';
import * as React from 'react';
import Vue from 'vue';
import {Watcher, Dep, Observer} from './util/vue-internals';
import {BindMethodGetterSymbol} from './util/decorators';

function noop() {}

class Events<T extends ReactiveComponent, E extends Record<string | symbol, any[]>> extends TypedEventEmitter<Events<T, E>, E> {
    constructor(readonly $i: T) {
        super();
    }
}

export interface WatchOptions {
    deep?: boolean;
    lazy?: boolean;
    sync?: boolean;
}

export default class ReactiveComponent<
    P = {}, S = {}, SS = any,
    E extends Record<string | symbol, any[]> = Record<string | symbol, any[]>,
    Ev extends Record<string | symbol, any[]> = EventMap<E>
> extends React.Component<P, S, SS> {
    private $vm = {_watchers: []};
    private $renderwatcher!: Watcher<React.ReactNode>;
    private $computedwatchers!: Record<string | number | symbol, Watcher<unknown>>;

    private get $emitter(this: ReactiveComponent): Events<ReactiveComponent, any> {
        return Object.defineProperty(this, '$emitter', {
            configurable: true,
            enumerable: false,
            writable: false,
            value: new Events<ReactiveComponent, any>(this),
        }).$emitter;
    }

    constructor(props: P) {
        super(props);

        Object.defineProperty(this, '_reactInternalFiber', {
            configurable: false, enumerable: false, writable: true,
        });
        Object.defineProperty(this, '_reactInternalInstance', {
            configurable: false, enumerable: false, writable: true,
        });

        Object.defineProperty(this, '$vm', {
            configurable: false, enumerable: false, writable: false, value: this.$vm,
        });

        const cb = () => {
            this.forceUpdate();
        };
        const render = this.render;

        const $renderwatcher = new Watcher(this.$vm, () => {
            return render.call(this);
        }, cb, {lazy: true});

        Object.defineProperty(this, '$renderwatcher', {
            configurable: false, enumerable: false, writable: false, value: $renderwatcher,
        });
        Object.defineProperty(this, '$computedwatchers', {
            configurable: false, enumerable: false, writable: false, value: Object.create(null),
        });

        Object.defineProperty(this, '$watchers', {
            configurable: false, enumerable: false, writable: false, value: this.$watchers,
        });

        Object.defineProperty(this, '$effects', {
            configurable: false, enumerable: false, writable: false, value: this.$effects,
        });

        this.render = () => {
            this.$makereactive();
            return this.$renderwatcher.get();
        };
        this.$renderwatcher.lazy = false;
        this.$renderwatcher.run = cb;

        let proto = (this as any).__proto__;
        while (proto && proto !== ReactiveComponent.prototype) {
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
                if (!descriptor.get || key in this.$computedwatchers) continue;
                // @ts-ignore
                if (descriptor.get.displayName === BindMethodGetterSymbol) continue;

                const getter = descriptor.get.bind(this);

                // create internal watcher for the computed property.
                this.$computedwatchers[key] = new Watcher(this.$vm, getter, noop, {
                    lazy: true,
                });

                descriptor.get = () => this.$computedgetter(key);
                Object.defineProperty(this, key, descriptor);
            }

            proto = proto.__proto__;
        }
    }

    private $computedgetter(key: string | number | symbol) {
        this.$makereactive();

        const watcher = this.$computedwatchers && this.$computedwatchers[key as string | number];
        if (!watcher) return;

        if (watcher.dirty) {
            watcher.evaluate();
        }
        if (Dep.target) {
            watcher.depend();
        }

        return watcher.value;
    }

    private $watchers: Watcher<any>[] = [];

    protected $watch<T>(get: ((this: this) => T) | string, cb: (this: this, value: T, prevValue: T) => void, options?: WatchOptions & {lazy?: false}): () => void
    protected $watch<T>(get: ((this: this) => T) | string, cb: (this: this, value: T, prevValue: T | undefined) => void, options?: WatchOptions | true): () => void
    protected $watch<T>(get: ((this: this) => T) | string, cb: (this: this, value: T, prevValue: T | undefined) => void, options?: WatchOptions | true) {
        this.$makereactive();

        const watcher = new Watcher(this.$vm, get, cb, {
            deep: typeof options === 'object' ? options.deep : false,
            user: true,
            lazy: true,
            sync: typeof options === 'object' ? options.sync : false,
        });

        this.$watchers.push(watcher);

        watcher.lazy = false;
        watcher.evaluate();

        if ((typeof options === 'boolean' && options) ||
            (options && 'lazy' in options && !options.lazy)
        ) {
            cb.call(this, watcher.value, undefined);
        }

        return () => watcher.teardown();
    }

    $set<T extends Record<K, V>, K extends string | number | symbol, V>(obj: T, key: K, value: V): V {
        return Vue.set(obj, key as string | number, value);
    }
    $delete<T extends Record<K, any>, K extends string | number | symbol>(obj: T, key: K) {
        return Vue.delete(obj, key as string | number);
    }

    $on<K extends keyof Ev>(event: K, listener: EventListener<Events<ReactiveComponent, Ev>, Ev[K]>) {
        this.$emitter.on(event, listener);
    }
    $off<K extends keyof Ev>(event: K, listener: EventListener<Events<ReactiveComponent, Ev>, Ev[K]>) {
        this.$emitter.removeListener(event, listener);
    }
    $emit<K extends keyof Ev>(event: K, ...data: Ev[K]) {
        this.$emitter.emit(event, ...data);
    }

    private $makereactive() {
        this.$makereactive = noop;

        Object.defineProperty(this, '$props', {
            configurable: true, enumerable: false, writable: true, value: {...this.props},
        });
        Object.defineProperty(this, '$state', {
            configurable: true, enumerable: false, writable: true, value: this.state ? {...this.state} : null,
        });

        Object.defineProperty(this, 'props', {
            configurable: false, enumerable: false, //writable: true, value: this.props,
            get() {
                return this.$props;
            },
            set(props) {
                if (!isObjectShallowModified(this.$props, props)) return;
                // this.$props = props;
                Object.assign(this.$props, props);
            },
        });
        Object.defineProperty(this, 'state', {
            configurable: false, enumerable: false, //writable: true, value: this.state,
            get() {
                return this.$state;
            },
            set(state) {
                if (!this.$state) {
                    this.$state = {};
                    new Observer(this.$state);
                }
                if (!isObjectShallowModified(this.$state, state)) return;
                // this.$props = props;
                Object.assign(this.$state, state);
            },
        });

        Object.defineProperty(this, 'context', {
            configurable: false, enumerable: false, writable: true, value: this.context,
        });
        Object.defineProperty(this, 'refs', {
            configurable: false, enumerable: false, writable: true, value: this.refs,
        });

        // @ts-ignore
        if (!this.__ob__) new Observer(this);
        // @ts-ignore
        if (!this.props.__ob__) new Observer(this.props);
        // @ts-ignore
        if (this.state && !this.state.__ob__) new Observer(this.state);
    }

    private $effects: Effect<this>[] = [];

    protected $effect<
        Da = any, D extends any[] = Da extends any[] ? Da : [Da]
    >(callback: (this: this, ...data: D) => void | ((this: this, ...data: D) => void), data?: (() => Da) | null) {
        this.$effects.push(new Effect(this, callback, data));
    }

    componentDidMount() {
        this.$makereactive();

        for (const effect of this.$effects) {
            effect.componentDidMount();
        }
    }

    componentDidUpdate(prevProps: any, prevState: any) {
        for (const effect of this.$effects) {
            effect.componentDidUpdate(prevProps, prevState);
        }
    }

    componentWillUnmount() {
        this.$renderwatcher.teardown();

        for (const [key, watcher] of Object.entries(this.$computedwatchers)) {
            watcher.teardown();
        }

        for (const effect of this.$effects) {
            effect.componentWillUnmount();
        }
    }

    shouldComponentUpdate(nextProps: P, nextState: S) {
        return false;
        if (this.state !== nextState) {
            return true;
        }
        return isObjectShallowModified(this.props, nextProps);
    }
}

class Effect<C extends React.Component = ReactiveComponent, Da = any, D extends any[] = Da extends any[] ? Da : [Da]> {
    constructor(
        readonly component: C,
        readonly callback: (this: C, ...data: D) => void | ((this: C, ...data: D) => void),
        private data?: (() => Da) | null
    ) {}

    private hasRun = false;
    private lastdata: Da | undefined = undefined;
    private cleanup: ((this: C) => void) | null = null;

    update() {
        if (this.data === null && this.hasRun) return;

        const data = this.data?.call(this);
        if (this.data !== undefined) {
            const lastdata = this.lastdata;
            this.lastdata = data;

            if (this.hasRun && this.compare(data, lastdata)) return;
        }

        if (this.hasRun) {
            // @ts-ignore
            this.cleanup?.apply(this.component, lastdata instanceof Array ? lastdata : [lastdata]);
            this.cleanup = null;
        }

        // @ts-ignore
        const cleanup = this.callback.apply(this.component, data instanceof Array ? data : [data]);
        this.hasRun = true;
        this.cleanup = cleanup || null;
    }

    compare(data: any, lastdata: any): boolean {
        if (data instanceof Array && lastdata instanceof Array) {
            if (data.length !== lastdata.length) return false;

            for (const i in data) {
                if (data[i] !== lastdata[i]) return false;
            }

            return true;
        }

        return data === lastdata;
    }

    componentDidMount() {
        this.update();
    }

    componentDidUpdate(prevProps: any, prevState: any) {
        this.update();
    }

    componentWillUnmount() {
        if (this.cleanup) {
            this.cleanup.call(this.component);
        }

        this.hasRun = false;
        this.lastdata = undefined;
        this.cleanup = null;
    }
}

function isObjectShallowModified(prev: any, next: any) {
    if (prev == null || next == null || typeof prev !== 'object' || typeof next !== 'object') {
        return prev !== next;
    }
    const keys = Object.keys(prev);
    if (keys.length !== Object.keys(next).length) {
        return true;
    }
    let key;
    for (let i = keys.length - 1; i >= 0; i--) {
        key = keys[i];
        if (next[key] !== prev[key]) {
            return true;
        }
    }
    return false;
}
