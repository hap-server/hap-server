import uiplugin, {AccessorySetupConnection, DiscoveredAccessory} from '@hap-server/ui-api';
import Vue, {Component} from 'vue';

const AccessorySetupComponent: Component = {
    template: `<div class="accessory-setup">
        <form @submit="create()">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :disabled="creating" />
                </div>
            </div>
        </form>

        <div class="d-flex">
            <div v-if="creating">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="creating"
                @click="$emit('cancel')">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button" :disabled="creating || !name"
                @click="create">Add</button>
        </div>
    </div>`,
    props: {
        connection: AccessorySetupConnection,
        discoveredAccessory: DiscoveredAccessory,
        creating: Boolean,
    },
    data() {
        return {
            name: null,
        };
    },
    methods: {
        create(this: Vue & Component) {
            this.$emit('accessory', {
                plugin: 'virtual-switches',
                accessory: 'VirtualSwitch',
                name: this.name,
            });
        },
    },
};

uiplugin.registerAccessorySetupComponent('VirtualSwitch', AccessorySetupComponent, {
    name: 'Virtual switch',
    manual: true,
});
