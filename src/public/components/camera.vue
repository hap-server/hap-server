<template>
    <div :key="service.accessory.uuid + '.' + service.uuid"
        class="service-wrapper service-wrapper-camera" :class="{'service-wrapper-editing': edit}"
        :data-accessory-uuid="service.accessory.uuid" :data-service-uuid="service.uuid"
        :data-service-type="service.type" @contextmenu.prevent="showDetails"
        @touchstart="touchstart" @touchend="touchend" @click="() => edit ? showSettings() : null"
    >
        <div class="service">
            <div class="service-tile-contents">
                <div class="service-info">
                    <h5>{{ service.name || service.accessory.name || $t('service_tile.unknown') }}</h5>

                    <div class="flex-fill" />

                    <div v-if="loading_snapshot" class="service-status-icon service-updating-spinner">
                        <spinner light />
                    </div>
                    <div v-else-if="snapshot_error || service.is_unavailable || ![AccessoryStatus.WAITING, AccessoryStatus.DESTROYED, AccessoryStatus.CONNECTING, AccessoryStatus.DISCONNECTING, AccessoryStatus.READY].includes(service.accessory.status)" class="service-status-icon service-status-error">
                        <warning-icon />
                    </div>
                    <div v-else-if="snapshot_time && snapshot_age" class="clickable" @click="updateSnapshotImage">
                        {{ snapshot_age }}s
                    </div>
                </div>

                <div v-if="snapshot_error || service.is_unavailable || service.accessory.status !== AccessoryStatus.READY"
                    class="camera-error-wrapper"
                >
                    <div class="flex-fill" />

                    <div class="camera-error">
                        <p v-if="snapshot_error && snapshot_error.message && snapshot_error.message.match(/Can\'t find variable/)">
                            {{ $t('services.camera.unsupported_browser') }}
                        </p>
                        <p v-else-if="snapshot_error">{{ $t('services.camera.draw_error') }}</p>
                        <p v-else class="service-status">
                            {{ $t('service_tile.' + (service.is_unavailable ? 'not_available' : 'status_' + (
                                service.accessory.status === AccessoryStatus.WAITING ? 'waiting' :
                                service.accessory.status === AccessoryStatus.DESTROYED ? 'destroyed' :
                                service.accessory.status === AccessoryStatus.ERROR ? 'error' :
                                service.accessory.status === AccessoryStatus.CONNECTING ? 'connecting' :
                                service.accessory.status === AccessoryStatus.DISCONNECTING ? 'connecting' :
                                'unknown'
                            ))) }}
                        </p>
                    </div>

                    <div class="flex-fill" />
                </div>

                <div v-else class="camera-image-wrapper">
                    <canvas ref="canvas" width="1080" height="720" />
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    import Service, {type_names} from '../../client/service';
    import {AccessoryStatus} from '../../common/types/accessories';

    import WarningIcon from './icons/warning.vue';
    import Spinner from './icons/spinner.vue';

    export default {
        components: {
            WarningIcon,
            Spinner,
        },
        props: {
            service: Service,
            edit: Boolean,
        },
        data() {
            return {
                AccessoryStatus,

                details_open: false,
                touchstart_timeout: null,

                show_spinner: false,

                loading_snapshot: false,
                snapshot_time: null,
                snapshot_error: null,

                current_time: Date.now(),
            };
        },
        provide() {
            return {
                service: this.service,
            };
        },
        computed: {
            snapshot_age() {
                return Math.floor(this.current_time / 1000) - Math.floor(this.snapshot_time / 1000);
            },
        },
        watch: {
            edit(edit) {
                if (edit && this.touchstart_timeout) clearTimeout(this.touchstart_timeout);
            },
            'service.accessory.status'(status) {
                if (status !== AccessoryStatus.READY) return;

                this.updateSnapshotImage();
            },
            snapshot_age(age) {
                if (!this.loading_snapshot && age >= 20) {
                    this.updateSnapshotImage();
                }
            },
        },
        created() {
            this.age_timeout = setTimeout(this.ageTick, (Math.ceil(Date.now() / 1000) * 1000) - Date.now());
        },
        mounted() {
            if (this.service.accessory.status === AccessoryStatus.READY) {
                this.updateSnapshotImage();
            }
        },
        destroyed() {
            clearTimeout(this.age_timeout);
        },
        methods: {
            ageTick() {
                this.current_time = Date.now();

                if (this._isDestroyed) return;
                this.age_timeout = setTimeout(this.ageTick, (Math.ceil(Date.now() / 1000) * 1000) - Date.now());
            },
            showDetails() {
                if (this.$refs.service && this.$refs.service.showDetails) {
                    this.$refs.service.showDetails();
                } else if (this.service.is_system_service) {
                    this.$emit('show-settings');
                } else {
                    this.$emit('show-details', () => this.details_open = false);
                    this.details_open = true;
                }
            },
            showSettings() {
                this.$emit('show-settings');
            },
            touchstart() {
                if (this.edit) return;

                if (this.touchstart_timeout) clearTimeout(this.touchstart_timeout);

                this.touchstart_timeout = setTimeout(() => {
                    this.touchstart_timeout = null;
                    this.showDetails();
                }, 500);
            },
            touchend() {
                if (this.touchstart_timeout) clearTimeout(this.touchstart_timeout);
            },
            async updateSnapshotImage() {
                if (this.loading_snapshot) throw new Error('Already loading snapshot');
                this.loading_snapshot = true;

                this.snapshot_time = null;
                this.snapshot_error = null;

                try {
                    if (!this.service.accessory.connection.connected) throw new Error('Not connected');
                    const buffer = await this.service.accessory.connection.requestSnapshot(this.service.accessory.uuid,
                        1080, 720);

                    const image = typeof createImageBitmap !== 'undefined' ?
                        await createImageBitmap(new Blob([buffer], {type: 'image/jpeg'})) :
                        await this.getImage(buffer, 'image/jpeg');

                    const ctx = this.$refs.canvas.getContext('2d');
                    ctx.imageSmoothingQuality = 'high';

                    ctx.drawImage(image,
                        0, 0, image.width, image.height,
                        0, 0, this.$refs.canvas.width, this.$refs.canvas.height);

                    console.log('Drawing snapshot image', buffer, image, ctx);
                    this.snapshot_time = Date.now();
                } catch (err) {
                    this.snapshot_time = Date.now();
                    this.snapshot_error = err;

                    console.error('Error drawing snapshot image', err);
                } finally {
                    this.loading_snapshot = false;
                }
            },
            async getImage(buffer, type) {
                const image = new Image();

                return new Promise((rs, rj) => {
                    image.onerror = rj;
                    image.onload = () => rs(image);

                    image.src = 'data:' + type + ';base64,' + buffer.toString('base64');
                });
            },
        },
    };
</script>
