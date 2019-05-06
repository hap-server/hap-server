<template>
    <div class="automation-action">
        <div class="automation-action-header">
            <div class="flex-fill">
                <h4>Action #{{ id }}</h4>
            </div>

            <slot name="header-right" />
            <button v-if="editable" class="btn btn-danger btn-sm ml-3" type="button" :disabled="saving"
                @click="$emit('delete')">Remove action</button>
        </div>

        <div class="automation-action-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
        props: {
            id: String,
            action: Object,
            editable: Boolean,
            saving: Boolean,
        },
    };
</script>
