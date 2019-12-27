<template>
    <div class="service-wrapper scene" :class="{'service-wrapper-editing': editing}"
        :data-scene-uuid="scene.uuid" @contextmenu.prevent="showDetails"
        @touchstart="touchstart" @touchend="touchend" @click="() => editing ? showSettings() : null"
    >
        <div class="service scene" :class="{active: scene.active, updating: scene.activating || scene.deactivating, clickable: !scene.activating && !scene.deactivating && !editing}" @click="click">
            <div class="service-tile-contents">
                <div class="service-top">
                    <div v-if="scene.active_error" class="service-icon service-error">
                        <warning-icon />
                    </div>
                    <div v-else class="service-icon">
                        <home-icon />
                    </div>
                </div>

                <div class="service-info">
                    <h5>{{ scene.data.name || $t('scenes.scene.unknown') }}</h5>
                </div>
            </div>

            <transition>
                <div v-if="scene.activating" class="progress scene-activating-progress">
                    <div class="progress-bar bg-dark" role="progressbar" :style="{width: scene.activating_progress * 100 + '%'}"
                        :aria-valuenow="scene.activating_progress * 100 + ''" aria-valuemin="0" aria-valuemax="100" />
                </div>
            </transition>
            <transition>
                <div v-if="scene.deactivating" class="progress scene-deactivating-progress">
                    <div class="progress-bar bg-dark" role="progressbar" :style="{width: scene.deactivating_progress * 100 + '%'}"
                        :aria-valuenow="scene.deactivating_progress * 100 + ''" aria-valuemin="0" aria-valuemax="100" />
                </div>
            </transition>
        </div>
    </div>
</template>

<script>
    import Scene from '../../../../client/scene';
    import {PushModalSymbol} from '../../../internal-symbols';

    import HomeIcon from '../../icons/home.vue';
    import WarningIcon from '../../icons/warning.vue';

    export default {
        components: {
            HomeIcon,
            WarningIcon,
        },
        props: {
            scene: Scene,
            editing: Boolean,
        },
        inject: {
            pushModal: {from: PushModalSymbol},
        },
        data() {
            return {
                details_open: false,
                touchstart_timeout: null,
            };
        },
        methods: {
            showDetails() {
                this.showSettings();
                // this.$emit('show-details', () => this.details_open = false);
                // this.details_open = true;
            },
            showSettings() {
                this.pushModal({type: 'scene-settings', scene: this.scene});
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
            click() {
                if (this.editing || this.scene.activating || this.scene.deactivating) return;

                return this.toggle();
            },
            toggle() {
                return this.scene.active ? this.scene.deactivate() : this.scene.activate();
            },
        },
    };
</script>
