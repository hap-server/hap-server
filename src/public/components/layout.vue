<template>
    <div class="layout">
        <h1>{{ title }}</h1>

        <div class="section">
            <button class="btn btn-default btn-sm" @click="$emit('ping')">Ping</button>
        </div>

        <service-container v-for="(section, index) in display_sections"
            :title="section.name" :accessories="accessories" :sorted="section.accessories || getAllServices()"
            :edit="edit" :group="_uid" :key="index" @update-order="sorted => updateSectionAccessories(section, sorted)"
        >
            <template v-slot="{id}">
                <!-- <template v-for="accessory in accessories"> -->
                    <!-- Show a bridge tile -->
                    <!-- <service v-if="id === accessory.uuid + '.- -bridge' && bridgeUuids.includes(accessory.uuid)" :key="accessory.uuid + '.- -bridge'"
                        :connection="connection" :service="getBridgeService(accessory)"
                        @show-details="closing => $emit('modal', {type: 'accessory-details', service: getBridgeService(accessory), closing})" /> -->

                    <!-- Show a not supported tile -->
                    <!-- <service v-else-if="id === accessory.uuid + '.' && !accessory.display_services.length" :key="accessory.uuid + '.'"
                        :connection="connection" :service="getUnsupportedService(accessory)"
                        @show-details="closing => $emit('modal', {type: 'accessory-details', service: getUnsupportedService(accessory), closing})" /> -->

                    <!-- <service v-for="service in accessory.display_services" v-if="id === accessory.uuid + '.' + service.uuid" :key="accessory.uuid + '.' + service.uuid"
                        :connection="connection" :service="service"
                        @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})"
                        @show-settings="$emit('modal', {type: 'service-settings', service})" />
                </template> -->

                <service v-if="getService(id)" :key="id" :connection="connection" :service="getService(id)"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service: getService(id), closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service: getService(id)})" />
            </template>
        </service-container>

        <service-container v-if="edit"
            title="Other accessories" :accessories="accessories"
            :sorted="getAllServices().filter(uuid => !display_sections.find(s => s.accessories.includes(uuid)))"
            :edit="true" :group="_uid"
        >
            <template v-slot="{id}">
                <!-- <template v-for="accessory in accessories"> -->
                    <!-- Show a bridge tile -->
                    <!-- <service v-if="id === accessory.uuid + '.- -bridge' && bridgeUuids.includes(accessory.uuid)" :key="accessory.uuid + '.- -bridge'"
                        :connection="connection" :service="getBridgeService(accessory)"
                        @show-details="closing => $emit('modal', {type: 'accessory-details', service: getBridgeService(accessory), closing})" /> -->

                    <!-- Show a not supported tile -->
                    <!-- <service v-else-if="id === accessory.uuid + '.' && !accessory.display_services.length" :key="accessory.uuid + '.'"
                        :connection="connection" :service="getUnsupportedService(accessory)"
                        @show-details="closing => $emit('modal', {type: 'accessory-details', service: getUnsupportedService(accessory), closing})" /> -->

                    <!-- <service v-for="service in accessory.display_services" v-if="id === accessory.uuid + '.' + service.uuid" :key="accessory.uuid + '.' + service.uuid"
                        :connection="connection" :service="service"
                        @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})"
                        @show-settings="$emit('modal', {type: 'service-settings', service})" /> -->
                <!-- </template> -->

                <service :key="id" :connection="connection" :service="getService(id)"
                    @show-details="closing => $emit('modal', {type: 'accessory-details', service: getService(id), closing})"
                    @show-settings="$emit('modal', {type: 'service-settings', service: getService(id)})" />
            </template>
        </service-container>

        <!-- <h2>Display services</h2>

        <service-container v-for="accessory in accessories" v-if="accessory.display_services.length" :key="'1-' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.display_services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container>

        <h2>All services</h2>

        <service-container v-for="accessory in accessories" :key="'2' + accessory.uuid" :title="accessory.name">
            <service v-for="service in accessory.services" :data-key="service.uuid" :key="service.uuid" :connection="connection" :service="service" @show-details="closing => $emit('modal', {type: 'accessory-details', service, closing})" @show-settings="$emit('modal', {type: 'service-settings', service})" />
        </service-container> -->

        <div class="section">
            <p>{{ Object.keys(accessories).length }} accessor{{ Object.keys(accessories).length === 1 ? 'y' : 'ies' }}</p>
        </div>
    </div>
</template>

<script>
    import Connection from '../connection';
    import {BridgeService, UnsupportedService} from '../service';

    import Service from './service.vue';
    import ServiceContainer from './service-container.vue';

    export default {
        components: {
            Service,
            ServiceContainer,
        },
        props: {
            connection: Connection,
            title: {type: String, default: 'Home'},
            sections: {type: Array, default: () => []},
            accessories: Object,
            bridgeUuids: {type: Array, default: () => []},
            canEdit: Boolean,
            canDelete: Boolean,
        },
        data() {
            return {
                edit: false,
            };
        },
        computed: {
            display_sections() {
                return this.sections && this.sections.length ? this.sections : [{accessories: this.getAllServices()}];
            },
        },
        methods: {
            getAllServices() {
                const services = [];

                for (const accessory of Object.values(this.accessories)) {
                    // Bridge tile
                    if (this.bridgeUuids.includes(accessory.uuid)) services.push(accessory.uuid + '.--bridge');

                    // Not supported tile
                    else if (!accessory.display_services.length) services.push(accessory.uuid + '.');

                    for (const service of accessory.display_services) services.push(accessory.uuid + '.' + service.uuid);
                }

                return services;
            },
            getService(uuid) {
                const accessory_uuid = uuid.split('.')[0];
                const service_uuid = uuid.split('.')[1];

                const accessory = this.accessories[accessory_uuid];

                if (!accessory) return;

                if (service_uuid === '--bridge') {
                    if (!this.bridgeUuids.includes(accessory.uuid)) return;

                    return this.getBridgeService(accessory);
                }

                if (!service_uuid) {
                    return this.getUnsupportedService(accessory);
                }

                return accessory.getService(service_uuid);
            },
            getSectionAccessories(section) {
                if (!section.accessories) return Object.values(this.accessories);

                return section.accessories.map(uuid => this.accessories[uuid]).filter(a => a);
            },
            updateSectionAccessories(section, changes) {
                console.log('Updating section accessories', section, changes);

                // if (changes.added) section.accessories.splice(0, changes.added.newIndex, changes.added.element);
                // if (changes.removed) section.accessories.splice(1, changes.removed.oldIndex);

                this.$emit('update-accessories', section, changes);
            },
            getBridgeService(accessory) {
                // {accessory, type: '--bridge'}
                return BridgeService.for(accessory);
            },
            getUnsupportedService(accessory) {
                // {accessory}
                return UnsupportedService.for(accessory);
            },
        },
    };
</script>
