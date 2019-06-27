<template>
    <service class="service-lightbulb" :service="service" type="Lightbulb" :active="on" :updating="updating"
        :background-colour="on && colour ? colour : null" @click="setOn(!on)"
    >
        <lightbulb-icon slot="icon" />

        <p>{{ on && brightness !== undefined ? brightness + '%' : on ? 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import ServiceComponent from './service.vue';
    import LightbulbIcon from '../icons/lightbulb.vue';

    export const uuid = Service.Lightbulb;

    export default {
        components: {
            Service: ServiceComponent,
            LightbulbIcon,
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
            brightness() {
                return this.service.getCharacteristicValueByName('Brightness');
            },
            colour() {
                const hue = this.service.getCharacteristicByName('Hue');
                const saturation = this.service.getCharacteristicByName('Saturation');

                if (!hue || !saturation) return;

                return `hsla(${hue.value}, ${saturation.value}%, ${60 + (this.brightness / 3)}%)`;
            },
        },
        created() {
            for (const characteristic of [
                this.service.getCharacteristicByName('On'),
                this.service.getCharacteristicByName('Brightness'),
                this.service.getCharacteristicByName('Hue'),
                this.service.getCharacteristicByName('Saturation'),
            ]) {
                if (!characteristic) continue;

                characteristic.subscribe(this);
            }
        },
        destroyed() {
            for (const characteristic of [
                this.service.getCharacteristicByName('On'),
                this.service.getCharacteristicByName('Brightness'),
                this.service.getCharacteristicByName('Hue'),
                this.service.getCharacteristicByName('Saturation'),
            ]) {
                if (!characteristic) continue;

                characteristic.unsubscribe(this);
            }
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
