<template>
    <service class="service-outlet" :service="service" type="Outlet" :active="on" :updating="updating"
        :changed="changed" @click="service.setCharacteristicByName('On', !on)"
    >
        <outlet-icon slot="icon" />

        <p>{{ on ? 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import OutletIcon from '../icons/outlet.vue';

    export const uuid = Service.Outlet;

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
