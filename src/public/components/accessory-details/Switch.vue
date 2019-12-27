<template>
    <accessory-details class="accessory-details-switch" :active="on" :updating="updating" :changed="changed"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <switch-icon slot="icon" />

        <p>{{ $t('services.switch.switch') }}</p>
        <p v-if="updating">{{ $t('services.switch.updating') }}</p>
        <p @click.stop="service.setCharacteristicByName('On', !on)">
            {{ $t('services.switch.' + (on ? 'on' : 'off')) }}
        </p>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import AccessoryDetails from './accessory-details.vue';
    import SwitchIcon from '../icons/light-switch.vue';

    export const uuid = Service.Switch;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            AccessoryDetails,
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
