<template>
    <div class="service" :class="{active, updating, clickable: !error && !updating && $listeners.click && !editing, error}"
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

                <div class="flex-fill" />

                <div v-if="show_spinner" class="service-status-icon service-updating-spinner">
                    <spinner />
                </div>
                <div v-else-if="error" class="service-status-icon service-status-error">
                    <warning-icon />
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

    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import HomeIcon from '../icons/home.vue';
    import WarningIcon from '../icons/warning.vue';
    import Spinner from '../icons/spinner.vue';

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            HomeIcon,
            WarningIcon,
            Spinner,
        },
        props: {
            active: Boolean,
            updating: Boolean,
            changed: Boolean,
            error: {},
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
        data() {
            return {
                show_spinner: false,
                spinner_timeout: null,
            };
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
            subscribedCharacteristics() {
                return [
                    this.service.configured_name ? null : this.service.getCharacteristicByName('Name'),
                ];
            },
        },
        watch: {
            changed(changed) {
                if (!changed) {
                    this.show_spinner = false;
                    clearTimeout(this.spinner_timeout);
                    return;
                }

                this.spinner_timeout = setTimeout(() => {
                    this.show_spinner = true;
                }, 2000);
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
