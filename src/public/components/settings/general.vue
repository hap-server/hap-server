<template>
    <form @submit.prevent="save(true)">
        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">
                {{ $t('settings.name') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-name'" v-model="name" type="text" class="form-control form-control-sm"
                    :placeholder="$t('settings.name')" :disabled="loading || saving" />
            </div>
        </div>

        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-wallpaper'">
                {{ $t('settings.wallpaper') }}
            </label>
            <div class="col-sm-9">
                <div class="custom-file form-control-sm">
                    <input :id="_uid + '-wallpaper'" ref="file" type="file" class="custom-file-input"
                        :disabled="loading || saving || uploading" @change="upload" />
                    <label class="custom-file-label" :for="_uid + '-wallpaper'">
                        {{ $t('settings.choose_file') }}
                    </label>
                </div>
                <div v-if="uploading" class="progress mt-3">
                    <div class="progress-bar" :class="{'progress-bar-striped': typeof upload_progress !== 'number'}"
                        :style="{width: typeof upload_progress !== 'number' ? '100%' : upload_progress * 100 + 'px'}"
                        role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                </div>

                <input v-if="background_url" :id="_uid + '-wallpaper'" :value="background_url" type="text"
                    class="form-control form-control-sm mt-3" disabled />

                <img v-if="background_url" class="mt-3" :src="getAssetURL(background_url)"
                    :style="{maxHeight: '300px', maxWidth: '100%'}" />
            </div>
        </div>

        <div class="d-flex">
            <div v-if="loading">{{ $t('settings.loading') }}</div>
            <div v-else-if="saving">{{ $t('settings.saving') }}</div>
            <div class="flex-fill"></div>
            <button v-if="changed || uploading" class="btn btn-primary btn-sm" type="button"
                :disabled="loading || saving || uploading"
                @click="save()">{{ $t('settings.save') }}</button>
        </div>
    </form>
</template>

<script>
    import {ClientSymbol, GetAssetURLSymbol} from '../../internal-symbols';

    import axios from 'axios';

    export default {
        data() {
            return {
                loading: false,
                saving: false,
                uploading: false,
                upload_progress: null,

                data: null,
                name: null,
                background_url: null,
            };
        },
        inject: {
            client: {from: ClientSymbol},
            getAssetURL: {from: GetAssetURLSymbol},
        },
        computed: {
            changed() {
                if (!this.data) return false;

                return this.name !== this.data.name ||
                    this.background_url !== this.data.background_url;
            },
        },
        watch: {
            'client.connection.authenticated_user'(authenticated_user) {
                if (authenticated_user) this.reload();
            },
        },
        created() {
            if (this.client.connection && this.client.connection.authenticated_user) this.reload();
        },
        methods: {
            async reload() {
                if (this.loading) throw new Error('Already loading');
                this.loading = true;

                try {
                    const data = await this.client.connection.getHomeSettings();

                    this.data = data;
                    this.name = data.name;
                    this.background_url = data.background_url;
                } finally {
                    this.loading = false;
                }
            },
            async save() {
                if (this.saving) throw new Error('Already saving');
                this.saving = true;

                try {
                    const data = Object.assign({}, this.data, {
                        name: this.name,
                        background_url: this.background_url,
                    });

                    await this.client.connection.setHomeSettings(data);
                    this.$emit('updated-settings', data);
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

                    const response = await axios.post(this.getAssetURL('upload-layout-background'), form_data, {
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
