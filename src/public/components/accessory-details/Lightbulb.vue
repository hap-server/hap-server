<template>
    <accessory-details class="accessory-details-lightbulb" :active="on" :updating="updating"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <lightbulb-icon slot="icon" />

        <p>Lightbulb</p>

        <div style="flex: 1 1 10%;" />

        <div class="accessory-details-lightbulb-sections">
            <div class="accessory-details-lightbulb-sections-scroll-wrapper">
                <div class="accessory-details-lightbulb-power d-flex flex-column clickable" @click.stop="setOn(!on)">
                    <div class="flex-fill"></div>

                    <p @click.stop="setOn(!on)">{{ on ? 'On' : 'Off' }}</p>

                    <div v-if="service.getCharacteristicByName('Brightness')" style="flex: 1 1 10%;" />

                    <div v-if="service.getCharacteristicByName('Brightness')" @click.stop>
                        <input :id="_uid + '-brightness'" v-model="brightness" type="range"
                            class="form-control-range" />
                    </div>

                    <div class="flex-fill"></div>
                </div>

                <div v-if="colour" class="accessory-details-lightbulb-colour d-flex" @click.stop>
                    <div class="accessory-details-lightbulb-swatches">
                        <swatches-colour-picker v-model="colour" :palette="swatches" />
                    </div>
                    <div class="accessory-details-lightbulb-chrome">
                        <chrome-colour-picker v-model="colour" disable-alpha disable-fields
                            class="d-none d-md-flex flex-column" />
                    </div>
                </div>
            </div>
        </div>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import Characteristic from '../../../client/characteristic';

    import AccessoryDetails from './accessory-details.vue';
    import LightbulbIcon from '../icons/lightbulb.vue';
    import SwatchesColourPicker from 'vue-color/src/components/Swatches.vue';
    import ChromeColourPicker from 'vue-color/src/components/Chrome.vue';

    export const uuid = Service.Lightbulb;

    export const swatches = [
        ['#B71C1C', '#D32F2F', '#F44336', '#E57373', '#FFCDD2'],
        ['#880E4F', '#C2185B', '#E91E63', '#F06292', '#F8BBD0'],
        ['#4A148C', '#7B1FA2', '#9C27B0', '#BA68C8', '#E1BEE7'],
        ['#311B92', '#512DA8', '#673AB7', '#9575CD', '#D1C4E9'],
        ['#1A237E', '#303F9F', '#3F51B5', '#7986CB', '#C5CAE9'],
        ['#0D47A1', '#1976D2', '#2196F3', '#64B5F6', '#BBDEFB'],
        ['#01579B', '#0288D1', '#03A9F4', '#4FC3F7', '#B3E5FC'],
        ['#006064', '#0097A7', '#00BCD4', '#4DD0E1', '#B2EBF2'],
        ['#004D40', '#00796B', '#009688', '#4DB6AC', '#B2DFDB'],
        ['#1B5E20', '#388E3C', '#4CAF50', '#81C784', '#C8E6C9'],
        ['#33691E', '#689F38', '#8BC34A', '#AED581', '#DCEDC8'],
        ['#827717', '#AFB42B', '#CDDC39', '#DCE775', '#F0F4C3'],
        ['#F57F17', '#FBC02D', '#FFEB3B', '#FFF176', '#FFF9C4'],
        ['#FF6F00', '#FFA000', '#FFC107', '#FFD54F', '#FFECB3'],
        ['#E65100', '#F57C00', '#FF9800', '#FFB74D', '#FFE0B2'],
        ['#BF360C', '#E64A19', '#FF5722', '#FF8A65', '#FFCCBC'],
        ['#3E2723', '#5D4037', '#795548', '#A1887F', '#D7CCC8'],
        ['#263238', '#455A64', '#607D8B', '#90A4AE', '#CFD8DC'],
        ['#000000', '#FFFFFF'],
    ];

    export default {
        components: {
            AccessoryDetails,
            LightbulbIcon,
            SwatchesColourPicker,
            ChromeColourPicker,
        },
        props: {
            service: Service,
        },
        data() {
            return {
                updating: false,
                swatches,
            };
        },
        computed: {
            on() {
                return this.service.getCharacteristicValueByName('On');
            },
            brightness: {
                get() {
                    return this.service.getCharacteristicValueByName('Brightness');
                },
                set(brightness) {
                    this.service.setCharacteristicByName('Brightness', brightness);
                },
            },
            hue: {
                get() {
                    return this.service.getCharacteristicValueByName('Hue');
                },
                set(hue) {
                    console.log('Setting hue to', hue);
                    this.service.setCharacteristicByName('Hue', hue);
                },
            },
            saturation: {
                get() {
                    return this.service.getCharacteristicValueByName('Saturation');
                },
                set(saturation) {
                    console.log('Setting saturation to', saturation);
                    this.service.setCharacteristicByName('Saturation', saturation);
                },
            },
            colour: {
                get() {
                    const hue = this.service.getCharacteristicByName('Hue');
                    const saturation = this.service.getCharacteristicByName('Saturation');

                    if (!hue || !saturation) return;

                    return {h: this.hue, s: this.saturation / 100};
                },
                set({hsl: colour}) {
                    const hue = this.service.getCharacteristicByName('Hue');
                    const saturation = this.service.getCharacteristicByName('Saturation');

                    if (!hue || !saturation) return;

                    this.hue = colour.h;
                    this.saturation = colour.s * 100;
                },
            },
        },
        created() {
            for (const characteristic of [
                this.service.getCharacteristicByName('On'),
                this.service.getCharacteristicByName('Brightness'),
                this.service.getCharacteristicByName('Hue'),
                this.service.getCharacteristicByName('Saturation'),
            ]) {
                if (!characteristic) continue;

                characteristic.subscribe(this);
            }
        },
        destroyed() {
            Characteristic.unsubscribeAll(this);
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
