<template>
    <automation-trigger :id="id" :trigger="trigger" :editable="editable" :saving="saving" @delete="$emit('delete')">
        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-expression'">Expression</label>
            <div class="col-sm-9">
                <input :id="_uid + '-expression'" v-model="trigger.expression" type="text"
                    class="form-control form-control-sm" :disabled="saving" />
            </div>
        </div>

        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-timezone'">Timezone</label>
            <div class="col-sm-9">
                <input :id="_uid + '-timezone'" v-model="trigger.timezone" type="text"
                    class="form-control form-control-sm" :disabled="saving" />
            </div>
        </div>
    </automation-trigger>
</template>

<script>
    import AutomationTrigger from '../trigger.vue';

    export const type = 'Cron';
    export const name = 'Time';

    export default {
        components: {
            AutomationTrigger,
        },
        props: {
            id: String,
            trigger: Object,
            editable: Boolean,
            saving: Boolean,
        },
    };
</script>
