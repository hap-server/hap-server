<template>
    <accessory-details class="accessory-television" :active="!!active" :updating="updating" :changed="changed"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <television-icon slot="icon" />

        <p>Television</p>
        <p v-if="updating">Updating</p>
        <p class="clickable" @click.stop="setActive(!active)">{{ active ? active_input_name || 'On' : 'Off' }}</p>

        <dropdown v-if="inputs.length" slot="footer-left" :label="active_input_name || 'Input'" colour="dark" type="up">
            <a v-for="input in inputs" :key="input.uuid" class="dropdown-item" :class="{active: input === active_input}"
                href="#" @click.prevent.stop="setActiveInput(input)"
            >{{ input.getCharacteristicValueByName('ConfiguredName') || input.name }}</a>
        </dropdown>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import AccessoryDetails from './accessory-details.vue';
    import TelevisionIcon from '../icons/television.vue';
    import Dropdown from '../dropdown.vue';

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
            AccessoryDetails,
            TelevisionIcon,
            Dropdown,
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
        methods: {
            async setActive(value) {
                await this.television_service.setCharacteristicByName('Active',
                    value ? Active.ACTIVE : Active.INACTIVE);
            },
            async setActiveInput(input) {
                await this.television_service.setCharacteristicByName('ActiveIdentifier',
                    input.getCharacteristicValueByName('Identifier'));
            },
        },
    };
</script>
