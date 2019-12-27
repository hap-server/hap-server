<template>
    <accessory-details class="accessory-details-programmable-switch"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <button-icon slot="icon" />

        <p>{{ $t('services.programmable_switch.programmable_switch') }}</p>
        <p>{{ $tc('services.programmable_switch.there_are_x_buttons', service.services.length) }}</p>

        <div class="programmable-switch-buttons">
            <div v-for="(button, index) in service.services" :key="index" class="programmable-switch-button">
                <h5>{{ getButtonName(button, index) }}</h5>
            </div>
        </div>
    </accessory-details>
</template>

<script>
    import Service from '../../../client/service';
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
        computed: {
            subscribedCharacteristics() {
                return this.service.services.map(service =>
                    service.getCharacteristicByName('ProgrammableSwitchEvent'));
            },
        },
        methods: {
            getButtonName(button, index) {
                if (!button.name) return this.$t('services.programmable_switch.button_x', {x: index + 1});

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
