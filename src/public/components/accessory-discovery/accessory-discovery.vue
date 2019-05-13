<template>
    <div class="service discovered-accessory" :class="{clickable: $listeners.click}" @click="$emit('click')">
        <div class="service-top">
            <div class="service-icon">
                <slot name="icon">
                    <bridge-icon />
                </slot>
            </div>
        </div>

        <div class="flex-fill" />

        <div class="service-info">
            <slot name="info">
                <slot name="name">
                    <h5>{{ name || 'Unknown' }}</h5>
                    <p>{{ type || 'Unknown' }}</p>
                </slot>

                <div class="service-status">
                    <slot>
                        <p>&nbsp;</p>
                    </slot>
                </div>
            </slot>
        </div>
    </div>
</template>

<script>
    import BridgeIcon from '../icons/hub.vue';

    export default {
        components: {
            BridgeIcon,
        },
        props: {
            name: {type: String, default: null},
            type: {type: String, default: null},
        },
    };
</script>
