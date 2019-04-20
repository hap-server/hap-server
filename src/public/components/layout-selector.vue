<template>
    <div class="dropdown" :class="{show: open}" @show.bs.dropdown="open = true" @hide.bs.dropdown="open = false">
        <button ref="toggle" :id="_uid + '-dropdown'" class="btn btn-sm btn-dark dropdown-toggle" type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" @click.stop="open = !open">
            {{ value ? value.name || value.uuid : name }}
        </button>

        <div ref="menu" class="dropdown-menu dropdown-menu-lg-right" :class="{show: open}" :aria-labelledby="_uid + '-dropdown'">
            <a class="dropdown-item" :class="{active: !value}" href="#" @click="$emit('input', null)">All accessories</a>

            <template v-if="Object.values(layouts).length">
                <div class="dropdown-divider"></div>
                <a v-for="layout in layouts" class="dropdown-item" :class="{active: value && value.uuid === layout.uuid}" href="#" @click="$emit('input', layout)">{{ layout.name || layout.uuid }}</a>

                <div v-if="canCreate" class="dropdown-divider"></div>
            </template>

            <a v-if="canCreate" class="dropdown-item" href="#" @click="$emit('new-layout')">New</a>
        </div>
    </div>
</template>

<script>
    import Connection from '../connection';
    import Layout from '../layout';
    import {BridgeService, UnsupportedService} from '../service';

    import Service from './service.vue';
    import ServiceContainer from './service-container.vue';

    export default {
        components: {
            Service,
            ServiceContainer,
        },
        props: {
            layouts: Object,
            value: Layout,
            name: {type: String, default: 'Home'},
            canCreate: Boolean,
        },
        data() {
            return {
                open: false,
            };
        },
        watch: {
            open(open) {
                if (open) document.body.addEventListener('click', this.close, true);
                else document.body.removeEventListener('click', this.close);
            },
        },
        destroy() {
            document.body.removeEventListener('click', this.close);
        },
        methods: {
            close() {
                this.open = false;
            },
        },
    };
</script>
