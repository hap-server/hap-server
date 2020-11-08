
const {default: pluginapi, AccessorySetupConnection, DiscoveredAccessory} = require('@hap-server/accessory-ui-api');
const {default: AccessoryDiscovery} = require('@hap-server/accessory-ui-api/accessory-discovery');

const AccessorySetupComponent = {
    template: `<div class="accessory-setup">
        <template v-if="discoveredAccessory">
            <p>Data from the accessory discovery handler:</p>
            <pre>{{ JSON.stringify(discoveredAccessory, null, 4) }}</pre>
        </template>

        <p v-else>Manual data.</p>

        <div class="d-flex">
            <div v-if="creating">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="creating"
                @click="$emit('cancel')">Cancel</button>
        </div>
    </div>`,
    props: {
        connection: AccessorySetupConnection,
        discoveredAccessory: DiscoveredAccessory,
        creating: Boolean,
    },
};

pluginapi.registerAccessorySetupComponent('Accessory', AccessorySetupComponent, {
    name: 'Accessory',
    manual: true,
});

const AccessoryDiscoveryComponent = {
    template: `<accessory-discovery :name="discoveredAccessory.name" type="Example accessory" @click="$emit('click')">
        <p>(Some identifying data from the DiscoveredAccessory object here.)</p>
    </accessory-discovery>`,
    components: {
        AccessoryDiscovery,
    },
    props: {
        discoveredAccessory: DiscoveredAccessory,
    },
};

pluginapi.registerAccessoryDiscoveryComponent('Accessory', AccessoryDiscoveryComponent);
