<template>
    <panel class="automation-settings" ref="panel" @close="$emit('close')">
        <form @submit.prevent="save(true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="automation.data.name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>
        </form>

        <p>Automation editor.</p>

        <div class="d-flex">
            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button"
                :disabled="saving || deleting" @click="() => $refs.panel.close()">Cancel</button>&nbsp;
            <button v-if="exists && deletable" class="btn btn-danger btn-sm" type="button"
                :disabled="saving || deleting" @click="() => $emit('delete')">Delete</button>&nbsp;
            <button class="btn btn-primary btn-sm" type="button"
                :disabled="!changed || saving || deleting" @click="$emit('save', true)">Save</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import {StagedAutomation} from './automation';

    import Panel from '../components/panel.vue';

    export default {
        components: {
            Panel,
        },
        props: {
            connection: Connection,
            automation: StagedAutomation,
            exists: Boolean,
            editable: Boolean,
            deletable: Boolean,
            changed: Boolean,
            saving: Boolean,
            deleting: Boolean,
        },
    };
</script>
