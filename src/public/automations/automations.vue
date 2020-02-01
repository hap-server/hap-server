<template>
    <div class="automations">
        <div class="main">
            <h1>{{ $t('automations.title') }}</h1>

            <div class="section">
                <p>
                    <button class="btn btn-default btn-sm" @click="createAutomation">
                        {{ $t('automations.new_button') }}
                    </button>

                    <span v-if="client.loading_automations">
                        <spinner size="inherit" light /> {{ $t('automations.loading') }}
                    </span>
                </p>
            </div>

            <div class="automation-groups-list">
                <div v-for="group in automation_groups" :key="group.name" class="automation-group">
                    <h2 v-if="group.name">{{ group.name }}</h2>
                    <div class="automations-list">
                        <div v-for="automation in group.automations" :key="automation.uuid"
                            class="automation-row clickable"
                            :class="{running: running_automations.find(r => r.automation === automation)}"
                            @click="open_automation = automation"
                        >
                            <div v-if="running_automations.find(r => r.automation === automation)" class="progress">
                                <div class="progress-bar" role="progressbar"
                                    :aria-valuenow="getAutomationProgress(automation) * 100" aria-valuemin="0"
                                    aria-valuemax="100"
                                    :style="{width: getAutomationProgress(automation) * 100 + '%'}" />
                            </div>

                            <div class="automation-row-contents">
                                <h3>{{ automation.data.name || automation.uuid }}</h3>

                                <p v-if="Object.keys(automation.data.conditions || {}).length">
                                    {{ $t('automations.automation_row_x_triggers_x_conditions_x_actions', {
                                        triggers: $tc('automations.automation_row_x_triggers',
                                            Object.keys(automation.data.triggers || {}).length), // eslint-disable-line vue/html-indent
                                        conditions: $tc('automations.automation_row_x_conditions',
                                            Object.keys(automation.data.conditions || {}).length), // eslint-disable-line vue/html-indent
                                        actions: $tc('automations.automation_row_x_actions',
                                            Object.keys(automation.data.actions || {}).length), // eslint-disable-line vue/html-indent
                                    }) }}
                                </p>
                                <p v-else>
                                    {{ $t('automations.automation_row_x_triggers_x_actions', {
                                        triggers: $tc('automations.automation_row_x_triggers',
                                            Object.keys(automation.data.triggers || {}).length), // eslint-disable-line vue/html-indent
                                        actions: $tc('automations.automation_row_x_actions',
                                            Object.keys(automation.data.actions || {}).length), // eslint-disable-line vue/html-indent
                                    }) }}
                                </p>
                            </div>
                        </div>
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
    import Spinner from '../components/icons/spinner.vue';

    export default {
        components: {
            AutomationSettings,
            Spinner,
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
            automation_groups() {
                const groups = {};

                for (const automation of Object.values(this.client.automations)) {
                    const key = automation.data.group_name || '';
                    const group = groups[key] || (groups[key] = {
                        name: automation.data.group_name,
                        automations: [],
                    });

                    group.automations.push(automation);
                }

                return Object.values(groups).sort((a, b) => {
                    if (!a.name && !b.name) return 0;
                    if (!a.name) return -1;
                    if (!b.name) return 1;

                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;

                    return 0;
                });
            },
            title() {
                if (this.open_automation) {
                    if (!this.open_automation.uuid) return this.$t('automations.new_automation');
                    return this.$t('automation_settings.title', {name: this.open_automation.data.name});
                }

                return this.$t('automations.title');
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
