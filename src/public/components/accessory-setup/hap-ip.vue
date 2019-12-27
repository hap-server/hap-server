<template>
    <div class="accessory-setup-hap-ip">
        <p>{{ discoveredAccessory ? JSON.stringify(discoveredAccessory) : $t('accessory_setup.hap_ip.manual') }}</p>

        <div class="d-flex">
            <div v-if="creating">{{ $t('accessory_setup.hap_ip.saving') }}</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="creating"
                @click="$emit('cancel')">{{ $t('accessory_setup.hap_ip.cancel') }}</button>
        </div>
    </div>
</template>

<script>
    import {AccessorySetupConnection} from '../../../client/connection';
    import {DiscoveredAccessory} from '../add-accessory.vue';

    export const id = 0;
    export const name = 'HomeKit (HAP over IP)';
    export const manual = true;

    export default {
        props: {
            connection: AccessorySetupConnection,
            discoveredAccessory: DiscoveredAccessory,
            creating: Boolean,
        },
    };
</script>
