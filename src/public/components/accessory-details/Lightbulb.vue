<template>
    <accessory-details class="accessory-details-lightbulb" :active="on" :updating="updating" :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')">
        <p>Lightbulb</p>
        <p v-if="updating">Updating</p>
        <p @click.stop="setOn(!on)">{{ on ? 'On' : 'Off' }}</p>
    </accessory-details>
</template>

<script>
    import Service from '../../service';
    import AccessoryDetails from './accessory-details.vue';

    export const uuid = Service.Lightbulb;

    export default {
        props: ['connection', 'service'],
        data() {
            return {
                updating: false,
            };
        },
        components: {
            AccessoryDetails,
        },
        computed: {
            on() {
                return this.service.getCharacteristicValueByName('On');
            },
            brightness() {
                return this.service.getCharacteristicValueByName('Brightness');
            }
        },
        methods: {
            async setOn(value) {
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.service.setCharacteristicByName('On', value);
                    console.log('Turning %s %s', this.service.name || this.service.accessory.name, value ? 'on' : 'off');
                } finally {
                    this.updating = false;
                }
            }
        }
    };
</script>