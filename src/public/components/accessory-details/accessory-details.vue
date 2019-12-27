<template>
    <div class="accessory-details" :class="{active: active, updating}">
        <div class="accessory-details-scroll-wrapper">
            <div class="accessory-details-container">
                <slot name="container">
                    <div class="accessory-details-icon">
                        <slot name="icon">
                            <home-icon />
                        </slot>
                    </div>

                    <h4>{{ name || service.name || service.accessory.name }}</h4>

                    <slot name="status" />

                    <slot />
                </slot>
            </div>

            <div class="accessory-details-footer">
                <div class="left">
                    <slot name="footer-left" />
                </div>

                <div class="right">
                    <slot name="footer-right">
                        <div v-if="$listeners['show-settings']" class="btn btn-dark btn-sm clickable"
                            @click.stop="$emit('show-settings')"
                        >
                            {{ $t('service_details.settings') }}
                        </div>
                        <div class="btn btn-dark btn-sm clickable"
                            @click.stop="() => $listeners.close ? $emit('close') : closeAccessoryDetails()"
                        >
                            {{ $t('service_details.close') }}
                        </div>
                    </slot>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    import HomeIcon from '../icons/home.vue';

    export default {
        components: {
            HomeIcon,
        },
        props: {
            active: Boolean,
            updating: Boolean,
            name: {type: String, default: null},
        },
        inject: [
            'service',
            'closeAccessoryDetails',
        ],
    };
</script>
