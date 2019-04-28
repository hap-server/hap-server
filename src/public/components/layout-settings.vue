<template>
    <panel ref="panel" @close="$emit('close')">
        <p v-if="deleteLayout">Are you sure you want to delete this layout?</p>

        <form v-else @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                        :disabled="saving" />
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-wallpaper'">Wallpaper</label>
                <div class="col-sm-9">
                    <div class="custom-file form-control-sm">
                        <input ref="file" type="file" class="custom-file-input" :id="_uid + '-wallpaper'"
                            :disabled="saving || uploading" @change="upload" />
                        <label class="custom-file-label" :for="_uid + '-wallpaper'">Choose file</label>
                    </div>
                    <div v-if="uploading" class="progress mt-3">
                        <div class="progress-bar" :class="{'progress-bar-striped': typeof upload_progress !== 'number'}"
                            :style="{width: typeof upload_progress !== 'number' ? '100%' : upload_progress * 100 + 'px'}"
                            role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>

                    <input v-if="background_url" :id="_uid + '-wallpaper'" :value="background_url" type="text"
                        class="form-control form-control-sm mt-3" disabled />

                    <img v-if="background_url" class="mt-3" :src="'assets/' + background_url"
                        :style="{maxHeight: '300px', maxWidth: '100%'}" />
                </div>
            </div>
        </form>

        <div class="d-flex">
            <div v-if="saving && deleteLayout">Deleting</div>
            <div v-else-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button" :disabled="saving || uploading" @click="() => $refs.panel.close()">Cancel</button>&nbsp;
            <button v-if="deleteLayout" class="btn btn-danger btn-sm" type="button" :disabled="saving" @click="save(true)">Delete</button>
            <button v-else class="btn btn-primary btn-sm" type="button" :disabled="saving || uploading" @click="save(true)">{{ create ? 'Create' : 'Save' }}</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import Layout from '../layout';

    import axios from 'axios';

    import Panel from './panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            layout: Layout,
            create: Boolean,
            deleteLayout: Boolean,
        },
        data() {
            return {
                saving: false,
                uploading: false,
                upload_progress: null,

                name: null,
                background_url: null,
            };
        },
        created() {
            if (this.layout) {
                this.name = this.layout.name;
                this.background_url = this.layout.background_url;
            }
        },
        methods: {
            async save(close) {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    if (this.deleteLayout) {
                        await this.connection.deleteLayouts(this.layout.uuid);

                        this.$emit('remove', this.layout);
                        this.$emit('close');

                        return;
                    }

                    const data = Object.assign({}, this.create ? {
                        sections: [],
                    } : this.layout.data, {
                        name: this.name,
                        background_url: this.background_url,
                    });

                    if (!this.create) {
                        await this.layout.updateData(data);
                    } else {
                        const [uuid] = await this.connection.createLayouts(data);

                        const [[layout_permissions]] = await Promise.all([
                            // this.connection.getLayouts(uuid),
                            this.connection.getLayoutsPermissions(uuid),
                        ]);

                        const layout = new Layout(this.connection, uuid, data, layout_permissions);

                        this.$emit('layout', layout);
                    }

                    if (close) this.$emit('close');
                } finally {
                    this.saving = false;
                }
            },
            async upload() {
                if (this.uploading) throw new Error('Already uploading');
                this.uploading = true;
                this.upload_progress = null;

                try {
                    const form_data = new FormData();
                    form_data.append('background', this.$refs.file.files[0]);

                    const response = await axios.post('/assets/upload-layout-background', form_data, {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                        },
                        onUploadProgress: event => {
                            this.upload_progress = event.loaded / event.total;
                        },
                    });

                    this.background_url = response.data.name;
                } finally {
                    this.uploading = false;
                }
            },
        },
    };
</script>
