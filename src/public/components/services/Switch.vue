<template>
    <service class="service-switch" :service="service" :type="$t('services.switch.switch')" :active="on"
        :updating="updating" :changed="changed" @click="service.setCharacteristicByName('On', !on)"
    >
        <switch-icon slot="icon" />

        <p>{{ $t('services.switch.' + (on ? 'on' : 'off')) }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import SwitchIcon from '../icons/light-switch.vue';

    export const uuid = Service.Switch;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            Service: ServiceComponent,
            SwitchIcon,
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

            subscribedCharacteristics() {
                return [
                    this.service.getCharacteristicByName('On'),
                ];
            },
        },
    };
</script>
