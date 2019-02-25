<template>
    <div class="settings-wrapper">
        <div class="settings-overlay"></div>

        <div class="settings-window-wrapper">
            <div class="settings-window">
                <div class="settings-container">
                    <div class="form-group row">
                        <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                        <div class="col-sm-9">
                            <input type="text" class="form-control form-control-sm" :id="_id + '-name'" v-model="name" placeholder="Home" :disabled="loading || saving" />
                        </div>
                    </div>

                    <div class="d-flex">
                        <div v-if="loading">Loading</div>
                        <div v-else-if="saving">Saving</div>
                        <div class="flex-fill"></div>
                        <button class="btn btn-default btn-sm" type="button" @click="$emit('close')" :disabled="saving">Cancel</button>
                        <button class="btn btn-primary btn-sm" type="button" @click="save(true)" :disabled="loading || saving">Save</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    export default {
        props: ['connection'],
        data() {
            return {
                loading: false,
                saving: false,

                name: null,
            };
        },
        created() {
            this.reload();
        },
        methods: {
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    const data = await this.connection.getHomeSettings();

                    this.name = data.name;
                } finally {
                    this.loading = false;
                }
            },
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = {
                        name: this.name,
                    };

                    await this.connection.setHomeSettings(data);
                    this.$emit('updated-settings', data);

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            }
        }
    };
</script>
