<template>
    <div class="automation-trigger">
        <div class="automation-trigger-header">
            <div class="flex-fill">
                <h4>Trigger #{{ id }}</h4>
            </div>

            <button v-if="editable" class="btn btn-danger btn-sm ml-3" type="button" :disabled="saving"
                @click="$emit('delete')">Remove trigger</button>
        </div>

        <div class="automation-trigger-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
        props: {
            id: String,
            trigger: Object,
            editable: Boolean,
            saving: Boolean,
        },
    };
</script>
