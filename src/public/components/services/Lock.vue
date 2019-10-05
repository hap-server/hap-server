<template>
    <service class="service-lock-mechanism" :class="{'service-error': jammed || unknown_state}" :service="service"
        :type="$t('services.lock_mechanism.lock')" :active="unlocked || !locking" :updating="updating" :changed="changed" @click="setLocking(!locking)"
    >
        <switch-icon slot="icon" />

        <p v-if="jammed">{{ $t('services.lock_mechanism.jammed') }}</p>
        <p v-else-if="locked !== locking">{{ $t('services.lock_mechanism.' + (locking ? '' : 'un') + 'locking') }}</p>
        <p v-else-if="locked || unlocked">{{ $t('services.lock_mechanism.' + (locked ? '' : 'un') + 'locked') }}</p>
        <p v-else>{{ $t('services.lock_mechanism.unknown') }}</p>
    </service>
</template>

<script>
    import Service from '../../../client/service';
    import SubscribeCharacteristicsMixin from '../../mixins/characteristics';
    import ServiceComponent from './service.vue';
    import SwitchIcon from '../icons/light-switch.vue';

    export const uuid = Service.LockMechanism;

    const LockState = {
        UNSECURED: 0,
        SECURED: 1,
        JAMMED: 2,
        UNKNOWN: 3,
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
            target_state() {
                return this.service.getCharacteristicValueByName('LockTargetState');
            },
            locking() {
                return this.target_state === LockState.SECURED;
            },

            subscribedCharacteristics() {
                return [
                    this.service.getCharacteristicByName('LockCurrentState'),
                    this.service.getCharacteristicByName('LockTargetState'),
                ];
            },
        },
        methods: {
            async setLocking(value) {
                await this.service.setCharacteristicByName('LockTargetState',
                    value ? LockState.SECURED : LockState.UNSECURED);
            },
        },
    };
</script>
