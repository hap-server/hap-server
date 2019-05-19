<template>
    <ul v-if="Object.keys(tabs).length" class="nav nav-tabs nav-sm mb-3">
        <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
        <li v-for="(tab, id) in tabs" v-if="!tab.if || tab.if()" :key="id" class="nav-item">
            <a class="nav-link" :class="{active: id === value}" href="#" @click.prevent="$emit('input', id)">
                {{ tab.label || tab }}
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
    };
</script>
