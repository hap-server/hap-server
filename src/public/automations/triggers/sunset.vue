<template>
    <automation-trigger :id="id" :trigger="trigger" :editable="editable" :saving="saving" @delete="$emit('delete')">
        <div class="form-group row show-invalid-fields">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-latitude'">
                {{ $t('automation_triggers.sunset.latitude') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-latitude'" v-model="latitude" type="text"
                    class="form-control form-control-sm" pattern="^-?\d+(\.\d+)?$" required
                    :disabled="!editable || saving" @blur="blur" @paste="blur" />
            </div>
        </div>

        <div class="form-group row show-invalid-fields">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-longitude'">
                {{ $t('automation_triggers.sunset.longitude') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-longitude'" v-model="longitude" type="text"
                    class="form-control form-control-sm" pattern="^-?\d+(\.\d+)?$" required
                    :disabled="!editable || saving" @blur="blur" @paste="blur" />
            </div>
        </div>

        <div v-if="next_time" class="form-group row">
            <div class="col-sm-3" />
            <div class="col-sm-9">
                <small class="form-text">
                    {{ $t('automation_triggers.sunset.next_run_info', {time: next_time}) }}
                </small>
            </div>
        </div>

        <div v-if="is_geolocation_available" class="form-group row">
            <div class="col-sm-3" />
            <div class="col-sm-9">
                <button class="btn btn-default btn-sm" :disabled="!editable || is_locating" @click="useCurrentLocation">
                    {{ $t('automation_triggers.sunset.use_current_location') }}
                </button>
            </div>
        </div>
    </automation-trigger>
</template>

<script>
    import AutomationTrigger from '../trigger.vue';
    import map_urls from './map-urls';

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
        data() {
            return {
                is_locating: false,
            };
        },
        computed: {
            is_geolocation_available() {
                return window.isSecureContext && 'geolocation' in window.navigator;
            },

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
        methods: {
            blur(event) {
                const value = event.clipboardData ? event.clipboardData.getData('text') : event.target.value;

                for (let regex of map_urls) {
                    let latitude_index = 1;
                    let longitude_index = 2;
                    if (!(regex instanceof RegExp)) [regex, latitude_index, longitude_index] = regex;

                    const match = value.match(regex);

                    if (match) {
                        this.latitude = match[1];
                        this.longitude = match[2];

                        if (event.clipboardData) event.preventDefault();
                        this.$forceUpdate();

                        break;
                    }
                }
            },
            async useCurrentLocation() {
                if (this.is_locating) throw new Error('Already getting location');
                this.is_locating = true;

                try {
                    const position = await new Promise((rs, rj) => navigator.geolocation.getCurrentPosition(rs, rj, {
                        enableHighAccuracy: false,
                        timeout: 5000,
                        maximumAge: 0,
                    }));

                    this.latitude = position.coords.latitude;
                    this.longitude = position.coords.longitude;
                } finally {
                    this.is_locating = false;
                }
            },
        },
    };
</script>
