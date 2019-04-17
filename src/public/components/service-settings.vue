<template>
    <panel ref="panel" @close="$emit('close')">
        <form @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input type="text" class="form-control form-control-sm" :id="_uid + '-name'" v-model="name" :placeholder="service.default_name" :disabled="saving" />
                </div>
            </div>
        </form>

        <div class="d-flex">
            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" @click="$emit('show-accessory-settings')">Accessory settings</button>&nbsp;
            <button class="btn btn-default btn-sm" type="button" @click="() => $refs.panel.close()" :disabled="saving">Cancel</button>&nbsp;
            <button class="btn btn-primary btn-sm" type="button" @click="save(true)" :disabled="saving">Save</button>
        </div>
    </panel>
</template>

<script>
    import Panel from './panel.vue';

    export default {
        props: ['connection', 'service'],
        data() {
            return {
                saving: false,

                name: null,
            };
        },
        components: {
            Panel,
        },
        created() {
            this.name = this.service.configured_name;
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.service.data, {
                        name: this.name,
                    });

                    await this.service.updateData(data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
