<template>
    <div class="service service-switch" :class="{active}">
        <h5>{{ service.name || service.accessory.name }}</h5>
        <p>Programmable Switch</p>
        <p v-if="last_event === 0">Single Press</p>
        <p v-else-if="last_event === 1">Double Press</p>
        <p v-else-if="last_event === 2">Long Press</p>
    </div>
</template>

<script>
    import Service from '../../service';

    export const uuid = 'CollapsedService.' + Service.StatelessProgrammableSwitch;

    export default {
        props: ['connection', 'service'],
        data() {
            return {
                last_event: null,
                active: false,
            };
        },
        created() {
            if (this.programmable_switch_event) {
                this.programmable_switch_event.on('value-updated', this.handleSwitchEvent);
            }
        },
        destroy() {
            if (this.programmable_switch_event) {
                this.programmable_switch_event.removeListener('value-updated', this.handleSwitchEvent);
            }
        },
        computed: {
            programmable_switch_event() {
                return this.service.getCharacteristicByName('ProgrammableSwitchEvent');
            }
        },
        watch: {
            programmable_switch_event(programmable_switch_event, old_programmable_switch_event) {
                if (old_programmable_switch_event) {
                    this.programmable_switch_event.removeListener('value-updated', this.handleSwitchEvent);
                }

                if (programmable_switch_event) {
                    programmable_switch_event.on('value-updated', this.handleSwitchEvent);
                }
            }
        },
        methods: {
            handleSwitchEvent(value) {
                //
                console.log('Programmable Switch event', value);

                this.last_event = value;
                this.active = true;

                setTimeout(() => this.active = false, 1000);
                setTimeout(() => this.last_event = null, 5000);
            }
        }
    };
</script>
