<template>
    <div>
        <div class="list-group-group">
            <div v-for="group in accessory_groups" :key="group.name" class="list-group-group-item">
                <h4 v-if="group.name">{{ group.name }}</h4>
                <list-group>
                    <list-item v-for="accessory in group.accessories" :key="accessory.uuid"
                        @click="$emit('show-accessory-settings', accessory)"
                    >
                        {{ accessory.name || accessory.uuid }}
                        <small v-if="accessory.name" class="text-muted">{{ accessory.uuid }}</small>

                        <p v-if="accessory.display_services.length" class="mb-0">
                            <small>
                                <!-- TODO: translate -->
                                <template v-for="(service, index) in accessory.display_services">{{ service.name }}{{
                                    accessory.display_services.length - 2 === index ? ' and ' :
                                    accessory.display_services.length - 1 > index ? ', ' : '' }}</template>
                            </small>
                        </p>
                    </list-item>
                </list-group>
            </div>
        </div>

        <div class="d-flex">
            <button class="btn btn-default btn-sm" type="button" :disabled="!canAddAccessories"
                @click="$emit('show-add-accessory')">{{ $t('settings.add_accessory') }}</button>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="client.loading_accessories"
                @click="client.refreshAccessories()">{{ $t('settings.refresh_accessories') }}</button>&nbsp;
        </div>
    </div>
</template>

<script>
    import {ClientSymbol} from '../../internal-symbols';

    import ListGroup from '../list-group.vue';
    import ListItem from '../list-item.vue';

    export default {
        components: {
            ListGroup,
            ListItem,
        },
        props: {
            canAddAccessories: Boolean,
        },
        inject: {
            client: {from: ClientSymbol},
        },
        computed: {
            accessory_groups() {
                const groups = {};

                for (const accessory of Object.values(this.client.accessories || {})) {
                    const group = groups[accessory.data.room_name] || (groups[accessory.data.room_name] = {
                        name: accessory.data.room_name,
                        accessories: [],
                    });

                    group.accessories.push(accessory);
                }

                return Object.values(groups).sort((a, b) => {
                    if (!a.name && !b.name) return 0;
                    if (!a.name) return 1;
                    if (!b.name) return -1;

                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;

                    return 0;
                });
            },
        },
        created() {
            this.client.loadAccessories(this);
        },
        destroyed() {
            this.client.unloadAccessories(this);
        },
    };
</script>
