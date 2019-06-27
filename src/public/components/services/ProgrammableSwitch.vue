<template>
    <service class="service-programmable-switch" :service="service" type="Programmable Switch" :active="active">
        <button-icon slot="icon" />

        <p v-if="last_event_name">
            <span v-if="service.services.length >= 2">{{ getButtonName(last_characteristic.service) }}</span>
            {{ last_event_name }}
        </p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import ServiceComponent from './service.vue';
    import ButtonIcon from '../icons/button.vue';

    export const uuid = 'CollapsedService.' + Service.StatelessProgrammableSwitch;

    export default {
        components: {
            Service: ServiceComponent,
            ButtonIcon,
        },
        props: {
            service: Service,
        },
        data() {
            return {
                programmable_switch_events_listeners: new WeakMap(),

                active: false,
                last_characteristic: null,
                last_event: null,

                active_timeout: null,
                event_timeout: null,
            };
        },
        computed: {
            programmable_switch_events() {
                return this.service.services.map(s => s.getCharacteristicByName('ProgrammableSwitchEvent'));
            },
            last_event_name() {
                if (this.last_event === 0) return 'Single Press';
                if (this.last_event === 1) return 'Double Press';
                if (this.last_event === 2) return 'Long Press';

                return null;
            },
        },
        watch: {
            programmable_switch_events(programmable_switch_events, old_programmable_switch_events) {
                for (const programmable_switch_event of old_programmable_switch_events) {
                    programmable_switch_event.removeListener('value-updated',
                        this.programmable_switch_events_listeners.get(programmable_switch_event));
                    this.programmable_switch_events_listeners.delete(programmable_switch_event);

                    for (const characteristic of [
                        this.service.getCharacteristicByName('CurrentDoorState'),
                        this.service.getCharacteristicByName('TargetDoorState'),
                        this.service.getCharacteristicByName('LockCurrentState'),
                        this.service.getCharacteristicByName('LockTargetState'),
                    ]) {
                        if (!characteristic) continue;

                        characteristic.unsubscribe(this);
                    }
                }

                for (const programmable_switch_event of programmable_switch_events) {
                    let listener = this.programmable_switch_events_listeners.get(programmable_switch_event);
                    if (!listener) this.programmable_switch_events_listeners.set(programmable_switch_event,
                        listener = this.handleSwitchEvent.bind(null, programmable_switch_event));
                    programmable_switch_event.on('value-updated', listener);

                    for (const characteristic of [
                        this.service.getCharacteristicByName('CurrentDoorState'),
                        this.service.getCharacteristicByName('TargetDoorState'),
                        this.service.getCharacteristicByName('LockCurrentState'),
                        this.service.getCharacteristicByName('LockTargetState'),
                    ]) {
                        if (!characteristic) continue;

                        characteristic.subscribe(this);
                    }
                }
            },
        },
        created() {
            for (const programmable_switch_event of this.programmable_switch_events) {
                let listener = this.programmable_switch_events_listeners.get(programmable_switch_event);
                if (!listener) this.programmable_switch_events_listeners.set(programmable_switch_event,
                    listener = this.handleSwitchEvent.bind(null, programmable_switch_event));
                programmable_switch_event.on('value-updated', listener);

                for (const characteristic of [
                    this.service.getCharacteristicByName('CurrentDoorState'),
                    this.service.getCharacteristicByName('TargetDoorState'),
                    this.service.getCharacteristicByName('LockCurrentState'),
                    this.service.getCharacteristicByName('LockTargetState'),
                ]) {
                    if (!characteristic) continue;

                    characteristic.subscribe(this);
                }
            }
        },
        destroyed() {
            for (const programmable_switch_event of this.programmable_switch_events) {
                programmable_switch_event.removeListener('value-updated',
                    this.programmable_switch_events_listeners.get(programmable_switch_event));

                for (const characteristic of [
                    this.service.getCharacteristicByName('CurrentDoorState'),
                    this.service.getCharacteristicByName('TargetDoorState'),
                    this.service.getCharacteristicByName('LockCurrentState'),
                    this.service.getCharacteristicByName('LockTargetState'),
                ]) {
                    if (!characteristic) continue;

                    characteristic.unsubscribe(this);
                }
            }
        },
        methods: {
            handleSwitchEvent(characteristic, value) {
                clearTimeout(this.active_timeout);
                clearTimeout(this.event_timeout);

                //
                console.log('Programmable Switch event', characteristic, value);

                this.active = true;
                this.last_characteristic = characteristic;
                this.last_event = value;

                this.active_timeout = setTimeout(() => this.active = false, 1000);
                this.event_timeout = setTimeout(() => this.last_characteristic = this.last_event = null, 5000);
            },
            getButtonName(service) {
                if (!service.name || true) return 'Button #' + (this.service.services.indexOf(service) + 1);

                if (service.name.startsWith(this.service.name)) {
                    return service.name.substr(this.service.name.length).trim();
                } else if (service.name.startsWith(this.service.default_name)) {
                    return service.name.substr(this.service.default_name.length).trim();
                }

                return service.name;
            },
        },
    };
</script>
