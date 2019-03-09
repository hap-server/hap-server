<template>
    <accessory-details class="accessory-television" :active="active" :updating="updating" :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')">
        <television-icon slot="icon" />

        <p>Television</p>
        <p v-if="updating">Updating</p>
        <p @click.stop="setActive(active ? 0 : 1)">{{ active ? input_label || 'On' : 'Off' }}</p>
    </accessory-details>
</template>

<script>
    import Service from '../../service';
    import AccessoryDetails from './accessory-details.vue';
    import TelevisionIcon from '../icons/television.vue';

    export const uuid = 'CollapsedService.' + Service.Television;

    export default {
        props: ['service'],
        data() {
            return {
                updating: false,
            };
        },
        components: {
            AccessoryDetails,
            TelevisionIcon,
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

                return this.service.services.find(service => service.getCharacteristicValueByName('Identifier') === active_identifier);
            },
            input_label() {
                if (!this.active_input) return;

                return this.active_input.getCharacteristicValueByName('ConfiguredName');
            }
        },
        methods: {
            async setActive(value) {
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.television_service.setCharacteristicByName('Active', value);
                    console.log('Turning %s %s', this.service.name || this.service.accessory.name, value ? 'on' : 'off');
                } finally {
                    this.updating = false;
                }
            }
        }
    };
</script>
