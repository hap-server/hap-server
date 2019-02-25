<template>
    <div class="settings-wrapper">
        <div class="settings-overlay"></div>

        <div class="settings-window">
            <div class="settings-container">
                <p v-if="loading">Loading</p>
                <p v-if="saving">Saving</p>

                <input type="text" v-model="name" placeholder="Home" :disabled="loading || saving" />

                <button type="button" @click="$emit('close')">Cancel</button>
                <button type="button" @click="save" :disabled="loading || saving">Save</button>
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
            async save() {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = {
                        name: this.name,
                    };

                    await this.connection.setHomeSettings(data);
                    this.$emit('updated-settings', data);
                } finally {
                    this.saving = false;
                }
            }
        }
    };
</script>
