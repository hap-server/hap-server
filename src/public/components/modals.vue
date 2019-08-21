<template>
    <div class="modals">
        <template v-for="(modal, index) in modals.getDisplayModals()">
            <authenticate v-if="modal.type === 'authenticate'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" @close="modals.remove(modal)" />

            <settings v-else-if="modal.type === 'settings'" :key="getModalID(modal)" :ref="'modal-' + getModalID(modal)"
                :connection="client.connection" :accessories="client.accessories"
                :loading-accessories="client.loading_accessories" :can-add-accessories="canAddAccessories"
                :can-create-bridges="canCreateBridges" :can-open-console="canOpenConsole"
                :can-manage-users="canManageUsers" :can-edit-user-permissions="canManagePermissions"
                :can-access-server-info="canAccessServerSettings" @modal="pushModal"
                @show-accessory-settings="accessory => pushModal({type: 'accessory-settings', accessory})"
                @refresh-accessories="client.refreshAccessories()"
                @updated-settings="updatedSettings" @close="modals.remove(modal)" />
            <add-accessory v-else-if="modal.type === 'add-accessory'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" @close="modals.remove(modal)" />

            <layout-settings v-else-if="modal.type === 'layout-settings'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessories="client.accessories"
                :layout="modal.layout" @close="modals.remove(modal)" />
            <layout-settings v-else-if="modal.type === 'new-layout'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessories="client.accessories"
                :create="true" @layout="addNewLayout" @close="modals.remove(modal)" />
            <layout-settings v-else-if="modal.type === 'delete-layout'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessories="client.accessories"
                :layout="modal.layout" :delete-layout="true" @remove="removeLayout" @close="modals.remove(modal)" />

            <accessory-settings v-else-if="modal.type === 'accessory-settings'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessory="modal.accessory"
                :accessories="client.accessories" :bridge-uuids="bridgeUuids"
                @show-accessory-settings="accessory => pushModal({type: 'accessory-settings', accessory})"
                @show-service-settings="service => pushModal({type: 'service-settings', service,
                    fromAccessorySettings: () => modals.stack[index] === modal})"
                @modal="pushModal" @close="modals.remove(modal)" />
            <accessory-settings v-else-if="modal.type === 'new-bridge'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessories="client.accessories"
                :bridge-uuids="bridgeUuids" :create-bridge="true" @accessory="addNewAccessory"
                @close="modals.remove(modal)" />
            <accessory-settings v-else-if="modal.type === 'delete-bridge'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessory="modal.accessory"
                :accessories="client.accessories" :bridge-uuids="bridgeUuids" :delete-bridge="true"
                @remove="removeAccessory" @close="modals.remove(modal)" />

            <pairing-settings v-else-if="modal.type === 'pairing-settings'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :accessory="modal.accessory"
                :pairing="modal.pairing" :pairing-data="modal.data" :permissions="modal.permissions"
                @close="modals.remove(modal)" />

            <service-settings v-else-if="modal.type === 'service-settings'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :connection="client.connection" :service="modal.service"
                :from-accessory-settings="typeof modal.fromAccessorySettings === 'function' ?
                    modal.fromAccessorySettings() : modal.fromAccessorySettings"
                @show-accessory-settings="pushModal({type: 'accessory-settings', accessory: modal.service.accessory})"
                @close="modals.remove(modal)" />

            <accessory-details v-else-if="modal.type === 'accessory-details'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :modal="modal" :service="modal.service"
                @show-settings="pushModal({type: 'service-settings', service: modal.service})"
                @show-accessory-settings="pushModal({type: 'accessory-settings', accessory: modal.service.accessory})"
                @close="modals.remove(modal)" />

            <scene-settings v-else-if="modal.type === 'scene-settings'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :scene="modal.scene" @remove="removeScene"
                @close="modals.remove(modal)" />
            <scene-settings v-else-if="modal.type === 'create-scene'" :key="getModalID(modal)"
                :ref="'modal-' + getModalID(modal)" :create="true" @created="addNewScene"
                @close="modals.remove(modal)" />

            <setup v-else-if="modal.type === 'setup'" :key="getModalID(modal)" :ref="'modal-' + getModalID(modal)"
                :connection="client.connection" :query-token="setupToken" @close="modals.remove(modal)" />
        </template>
    </div>
</template>

<script>
    import Client from '../../client/client';
    import Modals from '../modals';

    import Authenticate from './authenticate.vue';
    import AccessoryDetails from './accessory-details.vue';

    const modal_ids = new WeakMap();
    let id = 0;

    export default {
        components: {
            Authenticate,

            AccessoryDetails,

            SceneSettings: () => import(/* webpackChunkName: 'automations' */ '../automations/scene-settings.vue'),

            Settings: () => import(/* webpackChunkName: 'settings' */ './settings.vue'),
            AddAccessory: () => import(/* webpackChunkName: 'settings' */ './add-accessory.vue'),
            LayoutSettings: () => import(/* webpackChunkName: 'settings' */ './layout-settings.vue'),
            AccessorySettings: () => import(/* webpackChunkName: 'settings' */ './accessory-settings.vue'),
            PairingSettings: () => import(/* webpackChunkName: 'settings' */ './pairing-settings.vue'),
            ServiceSettings: () => import(/* webpackChunkName: 'settings' */ './service-settings.vue'),

            Setup: () => import(/* webpackChunkName: 'setup' */ './setup.vue'),
        },
        props: {
            modals: Modals,
            client: Client,
            canAddAccessories: Boolean,
            canCreateBridges: Boolean,
            canOpenConsole: Boolean,
            canManageUsers: Boolean,
            canManagePermissions: Boolean,
            canAccessServerSettings: Boolean,
            bridgeUuids: {type: Array, default: () => []},
            setupToken: String,
        },
        methods: {
            pushModal(modal) {
                this.modals.add(modal);
            },
            getModalID(modal) {
                if (!modal_ids.has(modal)) {
                    modal_ids.set(modal, id++);
                }

                return modal_ids.get(modal);
            },
            updatedSettings() {
                this.$emit('updated-settings');
            },
            addNewLayout(layout) {
                this.$emit('new-layout', layout);
            },
            removeLayout(layout) {
                this.$emit('remove-layout', layout);
            },
            addNewAccessory(accessory) {
                this.$emit('new-accessory', accessory);
            },
            removeAccessory(accessory) {
                this.$emit('remove-accessory', accessory);
            },
            addNewScene(scene) {
                this.$emit('new-scene', scene);
            },
            removeScene(scene) {
                this.$emit('remove-scene', scene);
            },
        },
    };
</script>
