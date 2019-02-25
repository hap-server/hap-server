<template>
    <div class="settings-wrapper">
        <div class="settings-overlay"></div>

        <div class="settings-window">
            <div class="settings-container">
                <p v-if="saving">Saving</p>

                <input type="text" v-model="name" :placeholder="accessory.default_name" :disabled="saving" />

                <button type="button" @click="$emit('close')">Cancel</button>
                <button type="button" @click="save" :disabled="saving">Save</button>
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
            async save() {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = {
                        name: this.name,
                    };

                    await this.accessory.updateData(data);
                } finally {
                    this.saving = false;
                }
            }
        }
    };
</script>
