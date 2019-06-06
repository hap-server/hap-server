<template>
    <automation-trigger :id="id" :trigger="trigger" :editable="editable" :saving="saving" @delete="$emit('delete')">
        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-expression'">cron expression</label>
            <div class="col-sm-9">
                <input :id="_uid + '-expression'" v-model="trigger.expression" type="text"
                    class="form-control form-control-sm" :disabled="saving" />
            </div>
        </div>

        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-timezone'">Timezone</label>
            <div class="col-sm-9">
                <select :id="_uid + '-timezone'" v-model="trigger.timezone"
                    class="custom-select custom-select-sm" :disabled="saving"
                >
                    <option v-for="timezone in timezones.filter(t => t.startsWith('Etc/'))" :key="timezone"
                        :value="timezone">{{ timezone.substr(4) }}</option>
                    <option v-for="timezone in timezones.filter(t => !t.startsWith('Etc/'))" :key="timezone"
                        :value="timezone">{{ timezone }}</option>
                </select>
            </div>
        </div>
    </automation-trigger>
</template>

<script>
    import timezones from 'tz-offset/generated/offsets';

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
        data() {
            return {
                timezones: Object.keys(timezones).sort(),
            };
        },
    };
</script>
