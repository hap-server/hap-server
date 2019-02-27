<template>
    <div class="list-group">
        <div class="list-group-contents">
            <slot />
        </div>

        <div class="list-group-footer">
            <slot name="footer" />
        </div>
    </div>
</template>

<script>
    export default {
    };
</script>
