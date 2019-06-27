<template>
    <service class="service-outlet" :service="service" type="Outlet" :active="on" :updating="updating"
        @click="setOn(!on)"
    >
        <outlet-icon slot="icon" />

        <p>{{ on ? 'On' : 'Off' }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import ServiceComponent from './service.vue';
    import OutletIcon from '../icons/outlet.vue';

    export const uuid = Service.Outlet;

    export default {
        components: {
            Service: ServiceComponent,
            OutletIcon,
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
        },
        created() {
            for (const characteristic of [
                this.service.getCharacteristicByName('On'),
            ]) {
                if (!characteristic) continue;

                characteristic.subscribe(this);
            }
        },
        destroyed() {
            for (const characteristic of [
                this.service.getCharacteristicByName('On'),
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
