<template>
    <accessory-details class="accessory-details-programmable-switch"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <button-icon slot="icon" />

        <p>Programmable Switch</p>

        <p>There {{ service.services.length === 1 ? 'is' : 'are' }} {{ service.services.length || 'no' }}
            button{{ service.services.length !== 1 ? 's' : '' }}.</p>

        <div class="programmable-switch-buttons">
            <div v-for="(button, index) in service.services" :key="index" class="programmable-switch-button">
                <h5>{{ getButtonName(button, index) }}</h5>
            </div>
        </div>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
    import Characteristic from '../../../client/characteristic';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import AccessoryDetails from './accessory-details.vue';
    import ButtonIcon from '../icons/button.vue';

    export const uuid = 'CollapsedService.' + Service.StatelessProgrammableSwitch;

    export default {
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            AccessoryDetails,
            ButtonIcon,
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
            subscribedCharacteristics() {
                return this.service.services.map(service =>
                    service.getCharacteristicByName('ProgrammableSwitchEvent'));
            },
        },
        methods: {
            getButtonName(button, index) {
                if (!button.name) return 'Button #' + (index + 1);

                if (button.name.startsWith(this.service.name)) {
                    return button.name.substr(this.service.name.length).trim();
                } else if (button.name.startsWith(this.service.default_name)) {
                    return button.name.substr(this.service.default_name.length).trim();
                }

                return button.name;
            },
        },
    };
</script>
