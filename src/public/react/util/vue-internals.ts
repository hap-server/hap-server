import Vue from 'vue';

export interface Watcher<T, VM = any> {
    readonly vm: VM;
    expression: string;
    cb: Function;
    readonly id: number;
    deep: boolean;
    user: boolean;
    lazy: boolean;
    sync: boolean;
    dirty: boolean;
    readonly active: boolean;
    getter: Function;
    readonly value: T;

    deps: Dep[];

    get(): T;
    update(): void;
    run(): void;
    teardown(): void;

    evaluate(): void;
    depend(): void;
}
// const watcher: Watcher = new Vue({watch: {_() {}}})._watchers[0].constructor;
const watcher: Watcher<unknown> = new Vue({data: {b: null}, computed: {a() {
    return this.b, this;
// @ts-ignore
}}}).a._watchers[0];
export interface WatcherOptions {
    deep?: boolean;
    user?: boolean;
    lazy?: boolean;
    sync?: boolean;
}
export const Watcher: {
    new <T, VM>(vm: VM, expOrFn: string | ((vm: VM) => T), cb: (value: T, prevValue: T) => void, options?: WatcherOptions): Watcher<T, VM>;
} = watcher.constructor as any;

export interface Dep {
    id: number;
    subs: Array<Watcher<unknown>>;

    addSub(sub: Watcher<unknown>): void;
    removeSub(sub: Watcher<unknown>): void;
    depend(): void;
    notify(): void;
}
export const Dep: {
    new (): Dep;
    target: Watcher<unknown> | null;
} = watcher.deps[0].constructor as any;

export interface Observer<T = any> {
    value: T;
    dep: Dep;
    vmCount: number; // number of vms that has this object as root $data

    walk(obj: object): void;
    observeArray(items: any[]): void;
}
export const Observer: {
    new <T>(value: T): Observer<T>;
// @ts-ignore
} = (new Vue())._data.__ob__.constructor;

/*
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: object): Observer | void {
    let ob: Observer | void;
    if ('__ob__' in value && (value as any).__ob__ instanceof Observer) {
        ob = (value as any).__ob__;
    } else if (
        true
        // observerState.shouldConvert &&
        // !isServerRendering() &&
        // (Array.isArray(value) || isPlainObject(value)) &&
        // Object.isExtensible(value) &&
        // !value._isVue
    ) {
        ob = new Observer(value);
    }
    return ob;
}
