<template>
    <div class="service service-outlet" :class="{active: on, updating, clickable: !updating}" @click="setOn(!on)">
        <h5>{{ service.name || service.accessory.name }}</h5>
        <p>Outlet</p>
        <p v-if="updating">Updating</p>
        <p v-else>{{ on ? 'On' : 'Off' }}</p>
    </div>
</template>

<script>
    import Service from '../../service';

    export const uuid = Service.Outlet;

    export default {
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
