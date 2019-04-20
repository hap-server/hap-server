<template>
    <panel ref="panel" @close="$emit('close')">
        <form @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :disabled="saving" />
                </div>
            </div>
        </form>

        <div class="d-flex">
            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="saving" @click="() => $refs.panel.close()">Cancel</button>&nbsp;
            <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="save(true)">Save</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../connection';
    import Layout from '../layout';

    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            layout: Layout,
            new: Boolean,
        },
        data() {
            return {
                saving: false,

                name: null,
            };
        },
        created() {
            if (this.layout) {
                this.name = this.layout.name;
            }
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.new ? null : this.layout.data, {
                        name: this.name,
                    });

                    if (!this.new) {
                        await this.layout.updateData(data);
                    } else {
                        const uuid = await this.connection.createLayout(data);

                        this.$emit('layout', uuid);
                    }

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
        },
    };
</script>
