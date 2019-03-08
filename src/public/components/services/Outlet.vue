<template>
    <service class="service-outlet" :service="service" type="Outlet" :active="on" :updating="updating" @click="setOn(!on)">
        <p>{{ on ? 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../service';
    import ServiceComponent from './service.vue';

    export const uuid = Service.Outlet;

    export default {
        components: {
            Service: ServiceComponent,
        },
        props: ['connection', 'service'],
        data() {
            return {
                updating: false,
            };
        },
        computed: {
            on() {
                return this.service.getCharacteristicValueByName('On');
            }
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
            }
        }
    };
</script>
