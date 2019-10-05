<template>
    <service class="service-garage-door-opener" :class="{'service-error': stopped || jammed || unknown_state}"
        :service="service" :type="$t('services.garage_door.garage_door')"
        :active="open || opening || (has_lock && (unlocked || !locking))"
        :updating="updating" :changed="changed" @click="setOpening(!target_open)"
    >
        <switch-icon slot="icon" />

        <p v-if="stopped">{{ $t('services.garage_door.stopped') }}</p>
        <p v-else-if="jammed">{{ $t('services.garage_door.jammed') }}</p>
        <p v-else-if="opening || closing">{{ $t('services.garage_door.' + (opening ? 'open' : 'clos') + 'ing') }}</p>
        <p v-else-if="open !== target_open">{{ $t('services.garage_door.' +
            (target_open ? 'open' : 'clos') + 'ing') }}</p>
        <p v-else-if="has_lock && locked !== locking">{{ $t('services.garage_door.' +
            (locking ? '' : 'un') + 'locking') }}</p>
        <p v-else-if="has_lock && (locked || unlocked)">{{ $t('services.garage_door.' +
            (locked ? '' : 'un') + 'locked') }}</p>
        <p v-else-if="has_lock">{{ $t('services.garage_door.unknown') }}</p>
        <p v-else>{{ $t('services.garage_door.' + (open ? 'open' : 'closed')) }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
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
        mixins: [
            SubscribeCharacteristicsMixin,
        ],
        components: {
            Service: ServiceComponent,
            SwitchIcon,
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

            subscribedCharacteristics() {
                return [
                    this.service.getCharacteristicByName('CurrentDoorState'),
                    this.service.getCharacteristicByName('TargetDoorState'),
                    this.service.getCharacteristicByName('LockCurrentState'),
                    this.service.getCharacteristicByName('LockTargetState'),
                ];
            },
        },
        methods: {
            async setOpening(value) {
                await this.service.setCharacteristicByName('TargetDoorState',
                    value ? DoorState.OPEN : DoorState.CLOSED);
            },
            async setLocking(value) {
                await this.service.setCharacteristicByName('LockTargetState',
                    value ? LockState.SECURED : LockState.UNSECURED);
            },
        },
    };
</script>
