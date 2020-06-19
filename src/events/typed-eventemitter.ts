import {EventEmitter} from 'events';

export type EventMap<E> = {
    [K in keyof E]: E[K];
};
export type EventListener<T extends EventEmitter, A extends any[]> = (this: T, ...args: A) => void;

export default class TypedEventEmitter<
    T extends EventEmitter,
    E extends any = Record<string | symbol, any[]>,
    Events extends Record<string | symbol, any[]> = EventMap<E>
> extends EventEmitter {}

export default interface TypedEventEmitter<
    T extends EventEmitter,
    E extends any = Record<string | symbol, any[]>,
    Events extends Record<string | symbol, any[]> = EventMap<E>
> {
    addListener<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    on<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    once<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    prependListener<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    prependOnceListener<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    removeListener<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    off<E extends keyof Events>(event: E, listener: EventListener<T, Events[E]>): this;
    removeAllListeners<E extends keyof Events>(event?: E): this;
    listeners<E extends keyof Events>(event: E): EventListener<T, Events[E]>[];
    rawListeners<E extends keyof Events>(event: E): EventListener<T, Events[E]>[];

    emit<E extends keyof Events>(event: E, ...data: Events[E]): boolean;

    // eventNames(): (number & keyof Events)[];
    listenerCount<E extends keyof Events>(type: E): number;
} // eslint-disable-line semi
