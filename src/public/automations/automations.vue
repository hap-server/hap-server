<template>
    <div class="automations">
        <h1>Automations</h1>

        <div class="section">
            <p>No automations.</p>
        </div>

        <div class="automations-list">
            <div v-for="automation in automations" :key="automation.uuid" class="automation-row">
                <h4>Automation {{ automation.uuid }}</h4>
            </div>
        </div>
    </div>
</template>

<script>
    import Connection from '../../common/connection';
    import Automation from './automation';

    export default {
        props: {
            connection: Connection,
        },
        data() {
            return {
                automations: {},
                loading_automations: false,
            };
        },
        watch: {
            connection(connection, old_connection) {
                for (const automation of Object.values(this.automations)) {
                    automation.connection = connection;
                }

                if (connection) this.refreshAutomations();
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
                        uuid, new_automations_data[index], new_automations_permissions[index]));

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
        },
        created() {
            global.automations = this.automations;

            this.refreshAutomations();

            this.connection.on('add-automation', this.handleAddAutomation);
            this.connection.on('remove-automation', this.handleRemoveAutomation);
            this.connection.on('update-automation', this.handleUpdateAutomation);
        },
        destroyed() {
            this.connection.removeListener('add-automation', this.handleAddAutomation);
            this.connection.removeListener('remove-automation', this.handleRemoveAutomation);
            this.connection.removeListener('update-automation', this.handleUpdateAutomation);
        },
    };
</script>
