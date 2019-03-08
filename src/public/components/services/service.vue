<template>
    <div class="service" :class="{active, updating, clickable: !updating && $listeners.click}" @click="$emit('click')">
        <div class="service-top">
            <div class="service-icon">
                <slot name="icon">
                    <home-icon />
                </slot>
            </div>
        </div>

        <div class="flex-fill" />

        <div class="service-info">
            <slot name="info">
                <slot name="name">
                    <h5 v-if="show_room_name && room_name">{{ room_name }}</h5>
                    <h5>{{ service_name || 'Unknown' }}</h5>
                    <!-- <p v-if="true">{{ type || 'Unknown' }}</p> -->
                </slot>

                <div class="service-status">
                    <slot name="status">
                        <p v-if="updating">Updating</p>
                        <slot v-else>
                            <p>&nbsp;</p>
                        </slot>
                    </slot>
                </div>
            </slot>
        </div>
    </div>
</template>

<script>
    import HomeIcon from '../icons/home.vue';

    export default {
        components: {
            HomeIcon,
        },
        props: ['active', 'updating', 'service', 'type'],
        computed: {
            show_room_name() {
                return false;
            },
            room_name() {
                return null;
            },
            service_name() {
                if (!this.service) return null;

                const name = this.service.name || this.service.accessory.name || '';

                return name.startsWith(this.room_name) ? name.substr(this.room_name.length) : name;
            }
        }
    };
</script>
