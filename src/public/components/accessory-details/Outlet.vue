<template>
    <accessory-details class="accessory-details-outlet" :active="on" :updating="updating" :changed="changed"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <outlet-icon slot="icon" />

        <p>{{ $t('services.outlet.outlet') }}</p>
        <p v-if="updating">{{ $t('services.outlet.updating') }}</p>
        <p @click.stop="service.setCharacteristicByName('On', !on)">
            {{ $t('services.outlet.' + (on ? 'on' : 'off')) }}
        </p>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import AccessoryDetails from './accessory-details.vue';
    import OutletIcon from '../icons/outlet.vue';

    export const uuid = Service.Outlet;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            AccessoryDetails,
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
