<template>
    <automation-trigger :id="id" :trigger="trigger" :editable="editable" :saving="saving" @delete="$emit('delete')">
        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-latitude'">
                {{ $t('automation_triggers.sunset.latitude') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-latitude'" v-model="latitude" type="text"
                    class="form-control form-control-sm" :disabled="saving" />
            </div>
        </div>

        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-longitude'">
                {{ $t('automation_triggers.sunset.longitude') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-longitude'" v-model="longitude" type="text"
                    class="form-control form-control-sm" :disabled="saving" />
            </div>
        </div>

        <div v-if="next_time" class="form-group row">
            <div class="col-sm-3" />
            <div class="col-sm-9">
                <p>{{ $t('automation_triggers.sunset.next_run_info', {time: next_time}) }}</p>
            </div>
        </div>
    </automation-trigger>
</template>

<script>
    import AutomationTrigger from '../trigger.vue';

    import {getSunset} from 'sunrise-sunset-js';

    export const type = 'Sunset';
    export const name = 'Sunset';

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
        computed: {
            latitude: {
                get() {
                    return typeof this.trigger.latitude === 'number' ? '' + this.trigger.latitude : '';
                },
                set(latitude) {
                    latitude = parseFloat(latitude);
                    if (isNaN(latitude)) return;
                    this.$set(this.trigger, 'latitude', latitude);
                },
            },
            longitude: {
                get() {
                    return typeof this.trigger.longitude === 'number' ? '' + this.trigger.longitude : '';
                },
                set(longitude) {
                    longitude = parseFloat(longitude);
                    if (isNaN(longitude)) return;
                    this.$set(this.trigger, 'longitude', longitude);
                },
            },

            next_time() {
                if (typeof this.trigger.latitude !== 'number' || typeof this.trigger.longitude !== 'number') return;

                const next_sunset_time = getSunset(this.trigger.latitude, this.trigger.longitude);

                if (Date.now() > next_sunset_time.getTime()) {
                    // Sunset already passed this day
                    const DAY = 1000 * 60 * 60 * 24; // 1 second * in 1 minute * in 1 hour * in 1 day
                    return getSunset(this.trigger.latitude, this.trigger.longitude, new Date(Date.now() + DAY));
                }

                return next_sunset_time;
            },
        },
    };
</script>
