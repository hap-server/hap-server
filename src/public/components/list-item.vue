<template>
    <div class="list-group-item" @click="$emit('click')">
        <div class="list-group-item-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
    };
</script>
