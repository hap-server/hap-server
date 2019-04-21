<template>
    <div class="dropdown" :class="{show: open}">
        <button ref="toggle" :id="_uid + '-dropdown'" class="btn btn-sm btn-dark dropdown-toggle" type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" @click.stop="open = !open">
            {{ value ? value.name || value.uuid : 'All accessories' }}
        </button>

        <div ref="menu" class="dropdown-menu dropdown-menu-right" :class="{show: open}" :aria-labelledby="_uid + '-dropdown'">
            <a class="dropdown-item" :class="{active: !value}" href="#" @click.prevent="$emit('input', null)">All accessories</a>

            <template v-if="Object.values(layouts).length">
                <div class="dropdown-divider"></div>

                <a v-for="layout in layouts" :key="layout.uuid" class="dropdown-item" :class="{active: value && value.uuid === layout.uuid}" href="#" @click.prevent="$emit('input', layout)">{{ layout.name || layout.uuid }}</a>

                <div v-if="canCreate || (value && (value.can_set || value.can_delete))" class="dropdown-divider"></div>
            </template>

            <template v-if="value && (value.can_set || value.can_delete)">
                <a v-if="value.can_set" class="dropdown-item" href="#" @click.prevent="$emit('modal', {type: 'layout-settings', layout: value})">Settings</a>
                <a v-if="value.can_set" class="dropdown-item" href="#" @click.prevent="$emit('edit-layout')">Edit</a>
                <a v-if="value.can_delete" class="dropdown-item" href="#" @click.prevent="$emit('modal', {type: 'delete-layout', layout: value})">Delete</a>

                <div v-if="canCreate" class="dropdown-divider"></div>
            </template>

            <a v-if="canCreate" class="dropdown-item" href="#" @click.prevent="$emit('modal', {type: 'new-layout'})">New</a>
        </div>
    </div>
</template>

<script>
    import Layout from '../layout';

    export default {
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
