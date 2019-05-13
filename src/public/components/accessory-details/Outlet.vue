<template>
    <accessory-details class="accessory-details-outlet" :active="on" :updating="updating"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <outlet-icon slot="icon" />

        <p>Outlet</p>
        <p v-if="updating">Updating</p>
        <p @click.stop="setOn(!on)">{{ on ? 'On' : 'Off' }}</p>
    </accessory-details>
</template>

<script>
    import Service from '../../service';
    import AccessoryDetails from './accessory-details.vue';
    import OutletIcon from '../icons/outlet.vue';

    export const uuid = Service.Outlet;

    export default {
        components: {
            AccessoryDetails,
            OutletIcon,
        },
        props: {
            service: Service,
        },
        data() {
            return {
                updating: false,
            };
        },
        computed: {
            on() {
                return this.service.getCharacteristicValueByName('On');
            },
        },
        methods: {
            async setOn(value) {
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.service.setCharacteristicByName('On', value);
                    console.log('Turning %s %s',
                        this.service.name || this.service.accessory.name, value ? 'on' : 'off');
                } finally {
                    this.updating = false;
                }
            },
        },
    };
</script>
