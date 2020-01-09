<template>
    <service class="service-television" :service="service" :type="$t('services.television.television')"
        :active="!!active" :updating="updating" :changed="changed" @click="setActive(!active)"
    >
        <television-icon slot="icon" />

        <p>{{ active ? active_input_name || $t('services.television.on') : $t('services.television.off') }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import TelevisionIcon from '../icons/television.vue';

    export const uuid = Service.Television;
    export const icon_component = TelevisionIcon;

    const Active = {
        INACTIVE: 0,
        ACTIVE: 1,
    };

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            Service: ServiceComponent,
            TelevisionIcon,
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

            active() {
                return this.service.getCharacteristicValueByName('Active') === Active.ACTIVE;
            },
            active_input() {
                const active_identifier = this.service.getCharacteristicValueByName('ActiveIdentifier');

                return this.service.linked_services.find(service => service.type === Service.InputSource &&
                    service.getCharacteristicValueByName('Identifier') === active_identifier);
            },
            active_input_name() {
                if (!this.active_input) return;

                return this.active_input.getCharacteristicValueByName('ConfiguredName') || this.active_input.name;
            },
            subscribedCharacteristics() {
                return [
                    this.service.getCharacteristicByName('Active'),
                    this.service.getCharacteristicByName('ActiveIdentifier'),

                    this.active_input && this.active_input.getCharacteristicByName('ConfiguredName'),
                ];
            },
        },
        methods: {
            async setActive(value) {
                await this.service.setCharacteristicByName('Active',
                    value ? Active.ACTIVE : Active.INACTIVE);
            },
        },
    };
</script>
