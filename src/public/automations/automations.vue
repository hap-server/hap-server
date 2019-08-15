<template>
    <div class="automations">
        <div class="main">
            <h1>Automations</h1>

            <div class="section">
                <button class="btn btn-default btn-sm mt-3" @click="createAutomation">New</button>
            </div>

            <div class="automations-list">
                <div v-for="automation in client.automations" :key="automation.uuid" class="automation-row clickable"
                    :class="{running: running_automations.find(r => r.automation === automation)}"
                    @click="open_automation = automation"
                >
                    <div v-if="running_automations.find(r => r.automation === automation)" class="progress">
                        <div class="progress-bar" role="progressbar"
                            :aria-valuenow="getAutomationProgress(automation) * 100" aria-valuemin="0"
                            aria-valuemax="100" :style="{width: getAutomationProgress(automation) * 100 + '%'}" />
                    </div>

                    <div class="automation-row-contents">
                        <h3>{{ automation.data.name || automation.uuid }}</h3>

                        <p>
                            {{ Object.keys(automation.data.triggers || {}).length === 0 ? 'No' : Object.keys(automation.data.triggers || {}).length }}
                            trigger{{ Object.keys(automation.data.triggers || {}).length === 1 ? '' : 's' }},
                            {{ Object.keys(automation.data.conditions || {}).length === 0 ? 'no' : Object.keys(automation.data.conditions || {}).length }}
                            condition{{ Object.keys(automation.data.conditions || {}).length === 1 ? '' : 's' }},
                            {{ Object.keys(automation.data.actions || {}).length === 0 ? 'no' : Object.keys(automation.data.actions || {}).length }}
                            action{{ Object.keys(automation.data.actions || {}).length === 1 ? '' : 's' }}.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <automation-settings v-if="staged_automation" ref="automation" :key="open_automation.id"
            :connection="client.connection" :automation="open_automation.staged" :exists="!!open_automation.uuid"
            :editable="open_automation.can_set && !deleting_automation" :deletable="open_automation.can_delete"
            :changed="open_automation.changed" :saving="saving_automation" :deleting="deleting_automation"
            @save="close => saveAutomation(open_automation.staged, close ? $refs.automation : null)"
            @reset="() => open_automation.resetStagedAutomation()"
            @delete="deleteAutomation(open_automation, $refs.automation)"
            @close="open_automation = null" />
    </div>
</template>

<script>
    import Client from '../../client/client';
    import {AutomationsSymbol} from '../internal-symbols';
    import Automation from '../../client/automation';

    import AutomationSettings from './automation-settings.vue';

    export default {
        components: {
            AutomationSettings,
        },
        props: {
            client: Client,
        },
        data() {
            return {
                running_automations: [],

                open_automation: null,
                staged_automation: null,
                saving_automation: false,
                deleting_automation: false,
            };
        },
        provide() {
            return {
                [AutomationsSymbol]: () => this.client.automations,
            };
        },
        computed: {
            title() {
                if (this.open_automation) {
                    if (!this.open_automation.uuid) return 'New automation';
                    return this.open_automation.data.name + ' Settings';
                }

                return 'Automations';
            },
        },
        watch: {
            open_automation() {
                global.automation = this.open_automation;
                this.staged_automation = this.open_automation && this.open_automation.staged;
            },
            title(title) {
                this.$emit('title', title);
            },
        },
        methods: {
            createAutomation() {
                this.open_automation = new Automation(this.client.connection, null, {}, {get: true, set: true, delete: true});
            },
            async saveAutomation(staged_automation, automation_settings_panel) {
                if (this.saving_automation) throw new Error('Already saving');
                this.saving_automation = true;

                try {
                    if (staged_automation.uuid) {
                        // Update an existing automation
                        await staged_automation.save();
                    } else {
                        const automation = staged_automation.live;
                        const [uuid] = await this.client.connection.createAutomations(staged_automation.data);

                        automation.uuid = uuid;
                        automation._setData(staged_automation.data);

                        this.$set(this.client.automations, automation.uuid, automation);
                        this.$emit('new-automation', automation);
                        this.$emit('new-automations', [automation]);
                        this.$emit('updated-automations', [automation], []);
                    }

                    if (automation_settings_panel) automation_settings_panel.$refs.panel.close();
                } finally {
                    this.saving_automation = false;
                }
            },
            async deleteAutomation(automation, automation_settings_panel) {
                if (this.deleting_automation) throw new Error('Already deleting');
                this.deleting_automation = true;

                try {
                    if (automation.uuid) {
                        await this.client.connection.deleteAutomations(automation.uuid);

                        this.$delete(this.client.automations, automation.uuid);
                        this.$emit('removed-automation', automation);
                        this.$emit('removed-automations', [automation]);
                        this.$emit('updated-automations', [], [automation]);
                    } else {
                        // The automation hasn't been created yet
                        // It won't exist once the settings panel has been closed
                    }

                    if (automation_settings_panel) automation_settings_panel.$refs.panel.close();
                } finally {
                    this.deleting_automation = false;
                }
            },
            getAutomationProgress(automation) {
                const running = this.running_automations.filter(r => r.automation === automation);
                if (!running.length) return null;

                return running.reduce((acc, cur) => acc + cur.progress, 0) / running.length;
            },
            handleAutomationRunning(runner_id, automation) {
                this.running_automations.push({runner_id, automation, progress: 0});
            },
            handleAutomationProgress(runner_id, progress) {
                const running_automation = this.running_automations.find(r => r.runner_id === runner_id);
                if (!running_automation) return;

                this.$set(running_automation, 'progress', progress);
                this.$forceUpdate();
            },
            handleAutomationFinished(runner_id) {
                let index;
                while ((index = this.running_automations.findIndex(r => r.runner_id === runner_id)) > -1) this.running_automations.splice(index, 1);
            },
        },
        created() {
            global.automations = this.client.automations;

            this.client.loadAutomations(this);

            this.client.on('automation-running', this.handleAutomationRunning);
            this.client.on('automation-progress', this.handleAutomationProgress);
            this.client.on('automation-finished', this.handleAutomationFinished);
        },
        destroyed() {
            delete global.automations;

            this.client.unloadAutomations(this);

            this.client.removeListener('automation-running', this.handleAutomationRunning);
            this.client.removeListener('automation-progress', this.handleAutomationProgress);
            this.client.removeListener('automation-finished', this.handleAutomationFinished);
        },
    };
</script>
