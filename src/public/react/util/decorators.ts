// export {bind} from 'bind-decorator';

export const BindMethodGetterSymbol = Symbol('BindMethodGetter');

export function bind<T extends Function>(
    target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> | void {
    if (!descriptor || typeof descriptor.value !== 'function') {
        throw new TypeError(`Only methods can be decorated with @bind. <${propertyKey}> is not a method!`);
    }

    const get = function get(this: T): T {
        // eslint-disable-next-line no-invalid-this
        const bound: T = descriptor.value!.bind(this);
        // Credits to https://github.com/andreypopp/autobind-decorator for memoizing the result of bind against a symbol on the instance.
        // eslint-disable-next-line no-invalid-this
        Object.defineProperty(this, propertyKey, {
            value: bound,
            configurable: true,
            writable: true,
        });
        return bound;
    };
    get.displayName = BindMethodGetterSymbol;

    return {
        configurable: true,
        get,
    };
    // This doesn't work as target is the prototype, not an instance
    // return {
    //     configurable: true,
    //     value: descriptor.value.bind(target),
    // };
}

export function readonly<T = any>(target: object, key: string, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> | void {
    return {
        ...descriptor,
        configurable: false,
    };
}
