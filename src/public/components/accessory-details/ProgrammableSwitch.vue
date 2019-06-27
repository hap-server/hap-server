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
        created() {
            this.subscribeToNewServices(this.service.services);
            this.service.on('new-services', this.subscribeToNewServices);
            this.service.on('removed-services', this.unsubscribeFromRemovedServices);
        },
        destroyed() {
            this.unsubscribeFromRemovedServices(this.service.services);
            this.service.removeListener('new-services', this.subscribeToNewServices);
            this.service.removeListener('removed-services', this.unsubscribeFromRemovedServices);
        },
        methods: {
            subscribeToNewServices(services) {
                for (const service of this.service.services) {
                    const characteristic = service.getCharacteristicByName('ProgrammableSwitchEvent');
                    if (!characteristic) continue;

                    characteristic.subscribe(this);
                }
            },
            unsubscribeFromRemovedServices(services) {
                for (const service of services) {
                    const characteristic = service.getCharacteristicByName('ProgrammableSwitchEvent');
                    if (!characteristic) continue;

                    characteristic.unsubscribe(this);
                }
            },
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
