<template>
    <div class="accessory-details" :class="{active: active, updating}">
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
                    <div class="badge badge-pill badge-dark" @click.stop="$emit('show-settings')">Settings</div>
                </slot>
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
        props: ['active', 'updating', 'name'],
        inject: ['service']
    };
</script>
