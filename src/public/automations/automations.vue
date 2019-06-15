<template>
    <div class="automations">
        <div class="main">
            <h1>Automations</h1>

            <div class="section">
                <button class="btn btn-default btn-sm mt-3" @click="createAutomation">New</button>
            </div>

            <div class="automations-list">
                <div v-for="automation in automations" :key="automation.uuid" class="automation-row clickable"
                    @click="open_automation = automation"
                >
                    <h3>{{ automation.data.name || automation.uuid }}</h3>

                    <div class="automation-row-contents">
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

        <automation-settings v-if="open_automation" ref="automation" :key="open_automation.id" :connection="connection"
            :automation="open_automation.staged" :exists="!!open_automation.uuid"
            :editable="open_automation.can_set && !deleting_automation" :deletable="open_automation.can_delete"
            :changed="open_automation.changed" :saving="saving_automation" :deleting="deleting_automation"
            @save="close => saveAutomation(open_automation.staged, close ? $refs.automation : null)"
            @reset="() => open_automation.resetStagedAutomation()"
            @delete="deleteAutomation(open_automation, $refs.automation)"
            @close="open_automation = null" />
    </div>
</template>

<script>
    import Connection from '../../client/connection';
    import {AutomationsSymbol} from '../internal-symbols';
    import Automation from './automation';

    import AutomationSettings from './automation-settings.vue';

    export default {
        components: {
            AutomationSettings,
        },
        props: {
            connection: Connection,
        },
        data() {
            return {
                automations: {},
                loading_automations: false,

                open_automation: null,
                saving_automation: false,
                deleting_automation: false,
            };
        },
        provide() {
            return {
                [AutomationsSymbol]: this.automations,
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
            connection(connection, old_connection) {
                for (const automation of Object.values(this.automations)) {
                    automation.connection = connection;
                }

                if (connection) {
                    this.refreshAutomations();

                    connection.on('add-automation', this.handleAddAutomation);
                    connection.on('remove-automation', this.handleRemoveAutomation);
                    connection.on('update-automation', this.handleUpdateAutomation);
                }

                if (old_connection) {
                    old_connection.removeListener('add-automation', this.handleAddAutomation);
                    old_connection.removeListener('remove-automation', this.handleRemoveAutomation);
                    old_connection.removeListener('update-automation', this.handleUpdateAutomation);
                }
            },
            open_automation() {
                global.automation = this.open_automation;
            },
            title(title) {
                this.$emit('title', title);
            },
        },
        methods: {
            async refreshAutomations(dont_emit_events) {
                if (this.loading_automations) throw new Error('Already loading');
                this.loading_automations = true;

                try {
                    const automation_uuids = await this.connection.listAutomations();

                    const new_automation_uuids = [];
                    const removed_automation_uuids = [];

                    for (const uuid of automation_uuids) {
                        // Automation already exists
                        if (this.automations[uuid]) continue;

                        // Add this automation to the list of automations we don't yet know about
                        new_automation_uuids.push(uuid);
                    }

                    for (const uuid of Object.keys(this.automations)) {
                        // Automation still exists
                        if (automation_uuids.includes(uuid)) continue;

                        // Add this automation to the list of automations that have been removed
                        removed_automation_uuids.push(uuid);
                    }

                    const [new_automations_data, new_automations_permissions] = await Promise.all([
                        this.connection.getAutomations(...new_automation_uuids),
                        this.connection.getAutomationsPermissions(...new_automation_uuids),
                    ]);

                    const new_automations = new_automation_uuids.map((uuid, index) => new Automation(this.connection,
                        uuid, new_automations_data[index], new_automations_permissions[index])); // eslint-disable-line vue/script-indent

                    for (const automation of new_automations) {
                        this.$set(this.automations, automation.uuid, automation);
                        if (!dont_emit_events) this.$emit('new-automation', automation);
                    }

                    if (new_automations.length && !dont_emit_events) this.$emit('new-automations', new_automations);

                    const removed_automations = removed_automation_uuids.map(uuid => this.automations[uuid]);

                    for (const automation of removed_automations) {
                        this.$delete(this.automations, automation.uuid);
                        if (!dont_emit_events) this.$emit('removed-automation', automation);
                    }

                    if (removed_automations.length && !dont_emit_events) this.$emit('removed-automations', removed_automations);

                    if (new_automations.length || removed_automations.length) {
                        this.$emit('updated-automations', new_automations, removed_automations);
                    }
                } finally {
                    this.loading_automations = false;
                }
            },
            async handleAddAutomation(uuid) {
                if (this.automation[uuid]) return;

                const [[data], [permissions]] = await Promise.all([
                    this.connection.getAutomations(uuid),
                    this.connection.getAutomationsPermissions(uuid),
                ]);

                const automation = new Automation(this.connection, uuid, data, permissions);

                this.$set(this.automations, automation.uuid, automation);
                this.$emit('new-automation', automation);
                this.$emit('new-automations', [automation]);
                this.$emit('updated-automations', [automation], []);
            },
            handleRemoveAutomation(uuid) {
                const automation = this.automations[uuid];

                if (!automation) return;

                this.$delete(this.automations, automation.uuid);
                this.$emit('removed-automation', automation);
                this.$emit('removed-automations', [automation]);
                this.$emit('updated-automations', [], [automation]);
            },
            handleUpdateAutomation(uuid, data) {
                const automation = this.automations[uuid];

                automation._setData(data);
            },
            createAutomation() {
                this.open_automation = new Automation(this.connection, null, {}, {get: true, set: true, delete: true});
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
                        const [uuid] = await this.connection.createAutomations(staged_automation.data);

                        automation.uuid = uuid;
                        automation._setData(staged_automation.data);

                        this.$set(this.automations, automation.uuid, automation);
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
                        await this.connection.deleteAutomations(automation.uuid);

                        this.$delete(this.automations, automation.uuid);
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
        },
        created() {
            global.automations = this.automations;

            if (!this.connection) return;

            this.refreshAutomations();

            this.connection.on('add-automation', this.handleAddAutomation);
            this.connection.on('remove-automation', this.handleRemoveAutomation);
            this.connection.on('update-automation', this.handleUpdateAutomation);
        },
        destroyed() {
            if (!this.connection) return;

            this.connection.removeListener('add-automation', this.handleAddAutomation);
            this.connection.removeListener('remove-automation', this.handleRemoveAutomation);
            this.connection.removeListener('update-automation', this.handleUpdateAutomation);
        },
    };
</script>
