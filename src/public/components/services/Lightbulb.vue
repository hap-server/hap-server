<template>
    <service class="service-lightbulb" :service="service" type="Lightbulb" :active="on" :updating="updating" @click="setOn(!on)">
        <lightbulb-icon slot="icon" />

        <p>{{ on && brightness !== undefined ? brightness + '%' : on ? 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../service';
    import ServiceComponent from './service.vue';
    import LightbulbIcon from '../icons/lightbulb.vue';

    export const uuid = Service.Lightbulb;

    export default {
        components: {
            Service: ServiceComponent,
            LightbulbIcon,
        },
        props: ['service'],
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
        },
        methods: {
            async setOn(value) {
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.service.setCharacteristicByName('On', value);
                    console.log('Turning %s %s', this.service.name || this.service.accessory.name, value ? 'on' : 'off');
                } finally {
                    this.updating = false;
                }
            },
        },
    };
</script>
