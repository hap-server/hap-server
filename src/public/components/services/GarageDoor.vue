<template>
    <service class="service-garage-door-opener" :class="{'service-error': stopped || jammed || unknown_state}"
        :service="service" type="Lock" :active="open || opening || (has_lock && (unlocked || !locking))"
        :updating="updating" @click="setOpening(!target_open)"
    >
        <switch-icon slot="icon" />

        <p v-if="stopped">Stopped</p>
        <p v-else-if="jammed">Lock jammed</p>
        <p v-else-if="opening || closing">{{ opening ? 'Opening' : 'Closing' }}</p>
        <p v-else-if="open !== target_open">{{ target_open ? 'Opening' : 'Closing' }}</p>
        <p v-else-if="has_lock && locked !== locking">{{ locking ? 'Locking' : 'Unlocking' }}</p>
        <p v-else-if="has_lock && (locked || unlocked)">{{ locked ? 'Locked' : 'Unlocked' }}</p>
        <p v-else-if="has_lock">Unknown state</p>
        <p v-else>{{ open ? 'Open' : 'Closed' }}</p>
    </service>
</template>

<script>
    import Service from '../../service';
    import ServiceComponent from './service.vue';
    import SwitchIcon from '../icons/light-switch.vue';

    export const uuid = Service.GarageDoorOpener;

    const LockState = {
        UNSECURED: 0,
        SECURED: 1,
        JAMMED: 2,
        UNKNOWN: 3,
    };

    const DoorState = {
        OPEN: 0,
        CLOSED: 1,
        OPENING: 2,
        CLOSING: 3,
        STOPPED: 4,
    };

    export default {
        components: {
            Service: ServiceComponent,
            SwitchIcon,
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
            door_state() {
                return this.service.getCharacteristicValueByName('CurrentDoorState');
            },
            open() {
                return this.door_state === DoorState.OPEN;
            },
            close() {
                return this.door_state === DoorState.CLOSED;
            },
            opening() {
                return this.door_state === DoorState.OPENING;
            },
            closing() {
                return this.door_state === DoorState.CLOSING;
            },
            stopped() {
                return this.door_state === DoorState.STOPPED;
            },
            target_door_state() {
                return this.service.getCharacteristicValueByName('TargetDoorState');
            },
            target_open() {
                return this.target_door_state === DoorState.OPEN;
            },

            has_lock() {
                return !!this.service.getCharacteristicByName('LockCurrentState') &&
                    !!this.service.getCharacteristicByName('LockTargetState');
            },
            lock_state() {
                return this.service.getCharacteristicValueByName('LockCurrentState');
            },
            locked() {
                return this.lock_state === LockState.SECURED;
            },
            unlocked() {
                return this.lock_state === LockState.UNSECURED;
            },
            jammed() {
                return this.lock_state === LockState.JAMMED;
            },
            unknown_state() {
                return this.lock_state === LockState.UNKNOWN;
            },
            target_lock_state() {
                return this.service.getCharacteristicValueByName('LockTargetState');
            },
            locking() {
                return this.target_lock_state === LockState.SECURED;
            },
        },
        methods: {
            async setOpening(value) {
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.service.setCharacteristicByName('TargetDoorState',
                        value ? DoorState.OPEN : DoorState.CLOSED);
                    console.log((value ? 'Open' : 'Clos') + 'ing %s', this.service.name || this.service.accessory.name);
                } finally {
                    this.updating = false;
                }
            },
            async setLocking(value) {
                if (this.updating) return;
                this.updating = true;

                try {
                    await this.service.setCharacteristicByName('LockTargetState',
                        value ? LockState.SECURED : LockState.UNSECURED);
                    console.log((value ? 'L' : 'Unl') + 'ocking %s', this.service.name || this.service.accessory.name);
                } finally {
                    this.updating = false;
                }
            },
        },
    };
</script>
