<template>
    <accessory-details class="accessory-details-programmable-switch" :active="on" :updating="updating"
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
    import Service from '../../service';
    import AccessoryDetails from './accessory-details.vue';
    import ButtonIcon from '../icons/button.vue';

    export const uuid = 'CollapsedService.' + Service.StatelessProgrammableSwitch;

    export default {
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
            on() {
                return this.service.getCharacteristicValueByName('On');
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
            getButtonName(button, index) {
                if (!button.name) return 'Button #' + index;

                if (button.name.startsWith(this.service.name)) return button.name.substr(this.service.name.length).trim();
                if (button.name.startsWith(this.service.default_name)) return button.name.substr(this.service.default_name.length).trim();

                return button.name;
            },
        },
    };
</script>
