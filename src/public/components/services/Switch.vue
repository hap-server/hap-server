<template>
    <service class="service-switch" :service="service" type="Switch" :active="on" :updating="updating"
        @click="setOn(!on)"
    >
        <switch-icon slot="icon" />

        <p>{{ on ? 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import Characteristic from '../../../client/characteristic';
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
        data() {
            return {
                updating: false,
            };
        },
        computed: {
            on() {
                return this.service.getCharacteristicValueByName('On');
            },
            subscribedCharacteristics() {
                return [
                    this.service.getCharacteristicByName('On'),
                ];
            },
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
