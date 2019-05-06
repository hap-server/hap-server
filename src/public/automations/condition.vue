<template>
    <div class="automation-condition">
        <div class="automation-condition-header">
            <div class="flex-fill">
                <h4>Condition #{{ id }}</h4>
            </div>

            <slot name="header-right" />
            <button v-if="editable" class="btn btn-danger btn-sm ml-3" type="button" :disabled="saving"
                @click="$emit('delete')">Remove condition</button>
        </div>

        <div class="automation-condition-contents">
            <slot />
        </div>
    </div>
</template>

<script>
    export default {
        props: {
            id: String,
            condition: Object,
            editable: Boolean,
            saving: Boolean,
        },
    };
</script>
