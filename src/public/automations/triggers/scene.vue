<template>
    <automation-trigger :id="id" :trigger="trigger" :editable="editable" :saving="saving" @delete="$emit('delete')">
        <div class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-scene'">Scene</label>
            <div class="col-sm-9">
                <select :id="_uid + '-scene'" v-model="trigger.scene_uuid"
                    class="custom-select custom-select-sm" :disabled="saving"
                >
                    <option v-for="scene in scenes" :key="scene.uuid" :value="scene.uuid">
                        {{ scene.data.name || scene.uuid }}
                    </option>
                </select>
            </div>
        </div>
    </automation-trigger>
</template>

<script>
    import {ScenesSymbol} from '../../internal-symbols';
    import AutomationTrigger from '../trigger.vue';

    export const type = 'Scene';
    export const name = 'Scene activated';

    export default {
        components: {
            AutomationTrigger,
        },
        props: {
            id: String,
            trigger: Object,
            editable: Boolean,
            saving: Boolean,
        },
        inject: {
            scenes: {from: ScenesSymbol},
        },
    };
</script>
