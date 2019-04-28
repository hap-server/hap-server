<template>
    <panel ref="panel" @close="$emit('close')">
        <form @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :placeholder="service.default_name" :disabled="saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-room-name'">Room</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-room-name'" v-model="room_name" type="text" class="form-control form-control-sm"
                        :placeholder="service.accessory.data.room_name" :disabled="saving" />
                </div>
            </div>
        </form>

        <div class="d-flex">
            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" @click="$emit('show-accessory-settings')">Accessory settings</button>&nbsp;
            <button class="btn btn-default btn-sm" type="button" :disabled="saving" @click="() => $refs.panel.close()">Cancel</button>&nbsp;
            <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="save(true)">Save</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import Service from '../service';

    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            service: Service,
        },
        data() {
            return {
                saving: false,

                name: null,
                room_name: null,
            };
        },
        created() {
            this.name = this.service.configured_name;
            this.room_name = this.service.data.room_name;
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.service.data, {
                        name: this.name,
                        room_name: this.room_name,
                    });

                    const accessory_data = Object.assign({}, this.service.accessory.data, {
                        ['Service.' + this.service.uuid]: data,
                    });

                    if (!this.service.accessory.data.room_name) {
                        accessory_data.room_name = this.room_name;
                    }

                    await this.service.accessory.updateData(accessory_data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
