export function $set<T>(object: any, key: string, value: T): T {
    try {
        // @ts-ignore
        if (require.cache[require.resolveWeak('vue')]) {
            const {default: Vue} = require('vue');

            return Vue.set(object, key, value);
        }
    } catch (err) {}

    return object[key] = value;
}

export function $delete(object: any, key: string) {
    try {
        if (require.cache[require.resolve('vue')]) {
            const {default: Vue} = require('vue');

            return Vue.delete(object, key);
        }
    } catch (err) {}

    delete object[key];
}
