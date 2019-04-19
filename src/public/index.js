if (process.env.NODE_ENV === 'development') {
    require('@vue/devtools');
}

import Vue from 'vue';

import MainComponent from './components/main-component.vue';

const vue = new (Vue.extend(MainComponent))();

vue.$mount(document.body.firstElementChild);
