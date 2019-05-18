<template>
    <div class="list-group-item" :class="{'list-group-item-action': $listeners.click, clickable: $listeners.click}"
        @click="$emit('click')"
    >
        <div class="list-group-item-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
    };
</script>
