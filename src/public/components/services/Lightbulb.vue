<template>
    <service class="service-lightbulb" :service="service" :type="$t('services.lightbulb.lightbulb')"
        :active="on" :updating="updating" :changed="changed" :background-colour="on && colour ? colour : null"
        @click="service.setCharacteristicByName('On', !on)"
    >
        <lightbulb-icon slot="icon" />

        <p>{{ on && brightness !== undefined ? brightness + '%' : $t('services.lightbulb.' + (on ? 'on' : 'off')) }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import LightbulbIcon from '../icons/lightbulb.vue';

    export const uuid = Service.Lightbulb;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            Service: ServiceComponent,
            LightbulbIcon,
        },
        props: {
            service: Service,
        },
        computed: {
            updating() {
                return !!this.subscribedCharacteristics.find(c => c && c.updating);
            },
            changed() {
                return !!this.subscribedCharacteristics.find(c => c && c.changed);
            },

            on() {
                return this.service.getCharacteristicValueByName('On');
            },
            brightness() {
                return this.service.getCharacteristicValueByName('Brightness');
            },
            colour() {
                const hue = this.service.getCharacteristicByName('Hue');
                const saturation = this.service.getCharacteristicByName('Saturation');

                if (!hue || !saturation) return;

                return `hsla(${hue.value}, ${saturation.value}%, ${60 + (this.brightness / 3)}%)`;
            },
            subscribedCharacteristics() {
                return [
                    this.service.getCharacteristicByName('On'),
                    this.service.getCharacteristicByName('Brightness'),
                    this.service.getCharacteristicByName('Hue'),
                    this.service.getCharacteristicByName('Saturation'),
                ];
            },
        },
    };
</script>
