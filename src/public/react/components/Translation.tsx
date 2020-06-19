import * as React from 'react';
import {TranslationContext} from '../context';
import VueI18n from 'vue-i18n';

export interface StringProps {
    // children?: React.ReactNode;
    name: string;
    values?: VueI18n.Values;
    fallback?: React.ReactNode;

    // [key: string]: string;
}

export function String(props: StringProps) {
    const i18n = React.useContext(TranslationContext);

    const result = i18n?.t(props.name, props.values);
    if (result) return <>{result}</>;

    return <>{props.fallback ?? props.name}</>;
}

// eslint-disable-next-line func-call-spacing
const cache = new Map<string, (props: VueI18n.Values) => React.ReactElement>();

String.values = function values(key: string) {
    if (cache.has(key)) return cache.get(key)!;

    const component = StringWithValues.bind(null, key);
    // @ts-ignore
    component.displayName = 'StringWithValues<' + key + '>';
    cache.set(key, component);
    return component;
};

function StringWithValues(key: string, props: VueI18n.Values) {
    const i18n = React.useContext(TranslationContext);

    const result = i18n?.t(key, props);
    if (result) return <>{result}</>;

    return <>{key}</>;
}

export interface NumberProps {
    // children?: React.ReactNode;
    name: string;
    value: number;
    values?: VueI18n.Values;
    fallback?: React.ReactNode;

    // [key: string]: string;
}

export function Number(props: NumberProps) {
    const i18n = React.useContext(TranslationContext);

    const result = i18n?.t(props.name, props.values);
    if (result) return <>{result}</>;

    return <>{props.fallback ?? props.name}</>;
}

// eslint-disable-next-line func-call-spacing
const cache2 = new Map<string, (props: VueI18n.Values & {
    value: number;
}) => React.ReactElement>();

Number.values = function values(key: string) {
    if (cache2.has(key)) return cache2.get(key)!;

    const component = NumberWithValues.bind(null, key);
    // @ts-ignore
    component.displayName = 'NumberWithValues<' + key + '>';
    cache2.set(key, component);
    return component;
};

function NumberWithValues(key: string, props: VueI18n.Values & {
    value: number;
}) {
    const i18n = React.useContext(TranslationContext);

    const result = i18n?.tc(key, props.value, props);
    if (result) return <>{result}</>;

    return <>{key}</>;
}
