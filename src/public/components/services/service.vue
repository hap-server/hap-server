<template>
    <div class="service" :class="{active, updating, clickable: !updating && $listeners.click && !editing}"
        @click="click"
    >
        <div v-if="backgroundColour || backgroundImage" class="service-tile-background"
            :style="{backgroundColor: backgroundColour, backgroundImage: backgroundImage ? `url('${backgroundImage}')` : null}" />

        <div class="service-tile-contents">
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
    </div>
</template>

<script>
    import {LayoutSymbol, LayoutGetEditingSymbol} from '../../internal-symbols';

    import HomeIcon from '../icons/home.vue';

    export default {
        components: {
            HomeIcon,
        },
        props: {
            active: Boolean,
            updating: Boolean,
            name: {type: String, default: null},
            roomName: {type: String, default: null},
            type: {type: String, default: null},
            backgroundColour: {type: String, default: null},
            backgroundImage: {type: String, default: null},
        },
        inject: {
            layout: {from: LayoutSymbol},
            service: {},
            getEditing: {from: LayoutGetEditingSymbol},
        },
        computed: {
            editing() {
                return this.getEditing();
            },
            show_room_name() {
                return !this.layout || this.layout.name !== this.room_name;
            },
            room_name() {
                if (this.roomName || !this.service) return this.roomName;

                return this.service.data.room_name || this.service.accessory.data.room_name || '';
            },
            service_name() {
                if (this.name || !this.service) return this.name;

                const name = this.service.name || this.service.accessory.name || '';

                return name.startsWith(this.room_name) ? name.substr(this.room_name.length).trim() : name;
            },
        },
        methods: {
            click(event) {
                // Don't emit click events when editing layouts
                if (this.editing) return;

                this.$emit('click', event);
            },
        },
    };
</script>
