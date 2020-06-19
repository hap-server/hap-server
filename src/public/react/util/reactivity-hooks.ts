import {useReducer, useState, useEffect, useRef, useCallback} from 'react';
import {Watcher, observe} from './vue-internals';

export function useForceUpdate() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    return forceUpdate;
}

/**
 * Get and observe a value using Vue's reactivity system.
 *
 * @param {function} getter
 * @param {Array} [deps] Object the getter depends on (this will make sure Vue is observing them and if these change it will force update the watcher)
 * @return {any}
 */
export function useWatcher<T>(getter: () => T, deps: any[] = []) {
    // if (deps) observe(deps);
    for (const dep of deps) {
        if (typeof dep === 'object' && Object.isExtensible(dep)) observe(dep);
    }

    // Create refs to hold a (fake) VM and a Watcher
    const vm = useRef({_watchers: []});
    const watcher = useRef<Watcher<T> | null>(null);

    // Memoise the getter (with dependencies)
    const get = useCallback(getter, [...deps]);

    const cb = useCallback((value: T, prevValue: T) => {
        // Don't expose the previous value
        // React components using hooks should use the Effect hook instead
        // updateValue is defined later
        updateValue(value);
    }, []);

    if (!watcher.current) {
        watcher.current = new Watcher(vm.current, get, cb, {
            user: true,
        });
    }

    // The getter is memoised... if it changes dependencies have changes
    // Re-run the getter now
    if (watcher.current.getter !== get) {
        watcher.current.getter = get;
        watcher.current.run();
    }

    useEffect(() => {
        return () => {
            watcher.current!.teardown();
        };
    }, []);

    const [value, updateValue] = useState(() => {
        return watcher.current!.get();
    });

    return value;
}
