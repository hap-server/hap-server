<template>
    <service class="service-television" :service="service" type="Television" :active="!!active" :updating="updating"
        @click="setActive(active ? 0 : 1)"
    >
        <television-icon slot="icon" />

        <p>{{ active ? active_input_name || 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import Characteristic from '../../../client/characteristic';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import TelevisionIcon from '../icons/television.vue';

    export const uuid = 'CollapsedService.' + Service.Television;

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
        data() {
            return {
                updating: false,
            };
        },
        computed: {
            television_service() {
                return this.service.services.find(service => service.type === Service.Television);
            },
            active() {
                return this.television_service.getCharacteristicValueByName('Active');
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
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.television_service.setCharacteristicByName('Active', value);
                    console.log('Turning %s %s',
                        this.service.name || this.service.accessory.name, value ? 'on' : 'off');
                } finally {
                    this.updating = false;
                }
            },
        },
    };
</script>
