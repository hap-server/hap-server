<template>
    <accessory-details class="accessory-television" :active="!!active" :updating="updating"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <television-icon slot="icon" />

        <p>Television</p>
        <p v-if="updating">Updating</p>
        <p class="clickable" @click.stop="setActive(active ? 0 : 1)">{{ active ? active_input_name || 'On' : 'Off' }}</p>

        <dropdown v-if="inputs.length" slot="footer-left" :label="active_input_name || 'Input'" colour="dark" type="up">
            <a v-for="input in inputs" :key="input.uuid" class="dropdown-item" :class="{active: input === active_input}"
                href="#" @click.prevent.stop="setActiveInput(input)"
            >{{ input.getCharacteristicValueByName('ConfiguredName') || input.name }}</a>
        </dropdown>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import Characteristic from '../../../client/characteristic';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import AccessoryDetails from './accessory-details.vue';
    import TelevisionIcon from '../icons/television.vue';
    import Dropdown from '../dropdown.vue';

    export const uuid = 'CollapsedService.' + Service.Television;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            AccessoryDetails,
            TelevisionIcon,
            Dropdown,
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
            inputs() {
                return this.service.services.filter(service => service.type === Service.InputSource &&
                    (service.getCharacteristicValueByName('CurrentVisibilityState') === 0 /* SHOWN */ ||
                        this.active_input === service));
            },
            active_input() {
                if (!this.television_service) return;

                const active_identifier = this.television_service.getCharacteristicValueByName('ActiveIdentifier');

                return this.service.services
                    .find(service => service.getCharacteristicValueByName('Identifier') === active_identifier);
            },
            active_input_name() {
                if (!this.active_input) return;

                return this.active_input.getCharacteristicValueByName('ConfiguredName') || this.active_input.name;
            },
            subscribedCharacteristics() {
                return [
                    this.television_service.getCharacteristicByName('Active'),
                    this.television_service.getCharacteristicByName('ActiveIdentifier'),

                    ...this.inputs.map(input => input.getCharacteristicByName('CurrentVisibilityState')),
                    ...this.inputs.map(input => input.getCharacteristicByName('ConfiguredName')),
                ];
            },
        },
        created() {
            for (const characteristic of [
                this.television_service.getCharacteristicByName('Active'),
                this.television_service.getCharacteristicByName('ActiveIdentifier'),
            ]) {
                if (!characteristic) continue;

                characteristic.subscribe(this);
            }
        },
        destroyed() {
            Characteristic.unsubscribeAll(this);
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
            async setActiveInput(input) {
                await this.television_service.setCharacteristicByName('ActiveIdentifier',
                    input.getCharacteristicValueByName('Identifier'));
            },
        },
    };
</script>
