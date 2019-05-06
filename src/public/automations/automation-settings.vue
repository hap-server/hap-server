<template>
    <panel class="automation-settings" ref="panel" @close="$emit('close')">
        <ul class="nav nav-tabs nav-sm mb-3">
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'general'}" href="#" @click.prevent="tab = 'general'">General</a></li>
            <li class="nav-item"><a class="nav-link" :class="{active: tab === 'triggers'}" href="#" @click.prevent="tab = 'triggers'">Triggers</a></li>
        </ul>

        <form v-if="tab === 'general'" @submit.prevent="$emit('save', true)">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-name'">Name</label>
                <div class="col-sm-9">
                    <input :id="_uid + '-name'" v-model="automation.data.name" type="text"
                        class="form-control form-control-sm" :disabled="saving" />
                </div>
            </div>
        </form>

        <div v-if="tab === 'triggers'" class="automation-triggers">
            <p>The automation will run when any of these triggers run.</p>

            <template v-for="(trigger, id) in automation.data.triggers || {}">
                <component
                    v-if="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger)"
                    :is="trigger_components.find(c => c.plugin === trigger.plugin && c.type === trigger.trigger).component"
                    :key="id" :id="id" :trigger="trigger" :editable="editable" :saving="saving || deleting"
                    @delete="$delete(automation.data.triggers, id); $forceUpdate()" />
            </template>
        </div>

        <div class="d-flex">
            <div v-if="tab === 'triggers' && editable" class="dropdown dropup" :class="{show: add_trigger_dropdown_open}">
                <button :id="_uid + '-dropdown'" class="btn btn-sm btn-default dropdown-toggle" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"
                    :disabled="saving || deleting"
                    @click.stop="add_trigger_dropdown_open = !add_trigger_dropdown_open">Add trigger</button>

                <div class="dropdown-menu" :class="{show: add_trigger_dropdown_open}"
                    :aria-labelledby="_uid + '-dropdown'"
                >
                    <a v-for="{plugin, type, name} in trigger_components" :key="type"
                        class="dropdown-item" href="#" @click.prevent="addTrigger({plugin, trigger: type})"
                    >{{ name }}</a>
                </div>
            </div>

            <div v-if="saving">Saving</div>
            <div class="flex-fill"></div>
            <button class="btn btn-default btn-sm" type="button"
                :disabled="saving || deleting" @click="() => $refs.panel.close()">Cancel</button>&nbsp;
            <button v-if="exists && deletable" class="btn btn-danger btn-sm" type="button"
                :disabled="saving || deleting" @click="() => $emit('delete')">Delete</button>&nbsp;
            <button v-if="editable" class="btn btn-primary btn-sm" type="button"
                :disabled="!changed || saving || deleting" @click="$emit('save', true)">Save</button>
        </div>
    </panel>
</template>

<script>
    import Connection from '../../common/connection';
    import {StagedAutomation} from './automation';

    import Panel from '../components/panel.vue';

    import Trigger from './trigger.vue';

    import {trigger_components} from '.';
    import './triggers';

    export default {
        components: {
            Panel,
            Trigger,
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
        data() {
            return {
                tab: 'general',

                trigger_components,
                add_trigger_dropdown_open: false,
            };
        },
        methods: {
            addTrigger(data) {
                if (!this.automation.data.triggers) this.$set(this.automation.data, 'triggers', {});

                let id = 0;
                while (this.automation.data.triggers[id]) id++;

                this.$set(this.automation.data.triggers, id, data || {});
                this.$forceUpdate();
            },
        },
    };
</script>
