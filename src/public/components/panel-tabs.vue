<template>
    <ul v-if="show" class="nav nav-tabs nav-sm mb-3">
        <li v-for="(tab, id) in filtered_tabs" :key="id" class="nav-item">
            <a class="nav-link" :class="{active: id === value}" href="#" @click.prevent="$emit('input', id)">
                {{ tab.label ? typeof tab.label === 'function' ? tab.label() : tab.label :
                    typeof tab === 'function' ? tab() : tab }}

                <span v-if="tab.badge" class="badge badge-default">{{ tab.badge }}</span>
            </a>
        </li>
    </ul>
</template>

<script>
    export default {
        props: {
            value: String,
            tabs: {type: Object, default: () => ({})},
        },
        computed: {
            filtered_tabs() {
                const tabs = {};

                for (const [id, tab] of Object.entries(this.tabs)) {
                    if (tab.if && !tab.if()) continue;

                    tabs[id] = tab;
                }

                return tabs;
            },
            show() {
                if (!Object.keys(this.filtered_tabs).length) return false;
                if (Object.keys(this.filtered_tabs).length > 1) return true;
                return Object.keys(this.filtered_tabs)[0] !== this.value;
            },
        },
    };
</script>
