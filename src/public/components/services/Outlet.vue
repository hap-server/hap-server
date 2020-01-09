<template>
    <service class="service-outlet" :service="service" :type="$t('services.outlet.outlet')" :active="on"
        :updating="updating" :changed="changed" @click="service.setCharacteristicByName('On', !on)"
    >
        <outlet-icon slot="icon" />

        <p>{{ $t('services.outlet.' + (on ? 'on' : 'off')) }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import OutletIcon from '../icons/outlet.vue';

    export const uuid = Service.Outlet;
    export const icon_component = OutletIcon;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            Service: ServiceComponent,
            OutletIcon,
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
