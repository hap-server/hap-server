<template>
    <div class="settings-wrapper">
        <div class="settings-overlay"></div>

        <div class="settings-window-wrapper">
            <div class="settings-window">
                <div class="settings-container">
                    <div class="form-group row">
                        <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                        <div class="col-sm-9">
                            <input type="text" class="form-control form-control-sm" :id="_id + '-name'" v-model="name" :placeholder="accessory.default_name" :disabled="saving" />
                        </div>
                    </div>

                    <div class="d-flex">
                        <div v-if="saving">Saving</div>
                        <div class="flex-fill"></div>
                        <button class="btn btn-default btn-sm" type="button" @click="$emit('close')" :disabled="saving">Cancel</button>
                        <button class="btn btn-primary btn-sm" type="button" @click="save(true)" :disabled="saving">Save</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    export default {
        props: ['connection', 'accessory'],
        data() {
            return {
                saving: false,

                name: null,
            };
        },
        created() {
            this.name = this.accessory.configured_name;
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = {
                        name: this.name,
                    };

                    await this.accessory.updateData(data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            }
        }
    };
</script>
