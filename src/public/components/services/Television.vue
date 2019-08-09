<template>
    <service class="service-television" :service="service" type="Television" :active="!!active" :updating="updating"
        :changed="changed" @click="setActive(!active)"
    >
        <television-icon slot="icon" />

        <p>{{ active ? active_input_name || 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import TelevisionIcon from '../icons/television.vue';

    export const uuid = 'CollapsedService.' + Service.Television;

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

            television_service() {
                return this.service.services.find(service => service.type === Service.Television);
            },
            active() {
                return this.television_service.getCharacteristicValueByName('Active') === Active.ACTIVE;
            },
            active_input() {
                if (!this.television_service) return;

                const active_identifier = this.television_service.getCharacteristicValueByName('ActiveIdentifier');

                return this.service.services.find(service =>
                    service.getCharacteristicValueByName('Identifier') === active_identifier);
            },
            active_input_name() {
                if (!this.active_input) return;

                return this.active_input.getCharacteristicValueByName('ConfiguredName') || this.active_input.name;
            },
            subscribedCharacteristics() {
                return [
                    this.television_service.getCharacteristicByName('Active'),
                    this.television_service.getCharacteristicByName('ActiveIdentifier'),

                    this.active_input && this.active_input.getCharacteristicByName('ConfiguredName'),
                ];
            },
        },
        methods: {
            async setActive(value) {
                await this.television_service.setCharacteristicByName('Active',
                    value ? Active.ACTIVE : Active.INACTIVE);
            },
        },
    };
</script>
