import {Component} from 'vue';

declare interface IconModule {
    default: Component;
}

declare const icons: {
    [name: string]: IconModule;
};

export = icons;
