export default {
    home: 'Home',

    menu: {
        menu: 'Menu',
        all_accessories: 'All accessories',

        layout_settings: '{name} Settings',
        edit_layout: 'Edit layout',
        delete_layout: 'Delete layout',

        automations: 'Automations',

        authenticated_as: 'Authenticated as {name}',
        login: 'Login',

        settings: 'Settings',
        new_layout: 'New layout',
    },

    layout: {
        home: 'Home',

        accessories: 'Accessories',
        other_accessories: 'Other accessories',

        unknown_section_type: 'Unknown layout section type "{type}".',
        has_no_accessories: 'This layout has no accessories.',
        add_accessories: 'Add accessories',

        x_accessories: '0 accessories | 1 accessory | {n} accessories',
        x_of_x_accessories: '0 accessories | {available} of 1 accessory | {available} of {n} accessories',
    },

    layout_section: {
        accessories: 'Accessories',

        edit: 'Edit',
        add_section: 'Add section',
        remove_section: 'Remove section',
        drag: 'Drag',
        finish_editing: 'Finish editing',
    },

    service_tile: {
        system_service: 'System service',
        not_available: 'Not available',
        not_supported: 'Not supported',

        unknown: 'Unknown',
        updating: 'Updating',
    },

    service_details: {
        system_service: 'System service',
        not_available: 'Not available',
        not_supported: 'Not supported',

        settings: 'Settings',
        close: 'Close',
    },

    services: {
        bridge: {
            bridge: 'Bridge',
        },

        garage_door: {
            garage_door: 'Garage Door',
            stopped: 'Stopped',
            jammed: 'Lock jammed',
            opening: 'Opening',
            closing: 'Closing',
            open: 'Open',
            closed: 'Closed',
            locking: 'Locking',
            unlocking: 'Unlocking',
            locked: 'Locked',
            unlocked: 'Unlocked',
            unknown: 'Unknown state',
        },

        lightbulb: {
            lightbulb: 'Lightbulb',
            on: 'On',
            off: 'Off',
        },

        lock_mechanism: {
            lock: 'Lock',
            jammed: 'Jammed',
            locking: 'Locking',
            unlocking: 'Unlocking',
            locked: 'Locked',
            unlocked: 'Unlocked',
            unknown: 'Unknown state',
        },

        outlet: {
            outlet: 'Outlet',
            on: 'On',
            off: 'Off',
            updating: 'Updating',
        },

        programmable_switch: {
            programmable_switch: 'Programmable Switch',
            button_x: 'Button #{x}',
            single_press: 'Single Press',
            double_press: 'Double Press',
            long_press: 'Long Press',
            there_are_x_buttons: 'There are no buttons. | There is 1 button. | There are {n} buttons.',
        },

        switch: {
            switch: 'Switch',
            on: 'On',
            off: 'Off',
            updating: 'Updating',
        },

        television: {
            television: 'Television',
            on: 'On',
            off: 'Off',
            updating: 'Updating',
            input: 'Input',
        },
    },

    automations: {
        title: 'Automations',
        new_automation: 'New automation',
        new_button: 'New',

        automation_row_x_triggers_x_actions: '{triggers} and {actions}.',
        automation_row_x_triggers_x_conditions_x_actions: '{triggers}, {conditions} and {actions}.',
        automation_row_x_triggers: 'No triggers | 1 trigger | {n} triggers',
        automation_row_x_conditions: 'no conditions | 1 condition | {n} conditions',
        automation_row_x_actions: 'no actions | 1 action | {n} actions',
    },

    automation_settings: {
        title: '{name} Settings',

        general: 'General',
        triggers: 'Triggers',
        conditions: 'Conditions',
        actions: 'Actions',

        editor: 'Editor',
        other: 'Other',

        saving: 'Saving',
        cancel: 'Cancel',
        delete: 'Delete',
        save: 'Save',
        done: 'Done',

        // General
        name: 'Name',
        group: 'Group',

        // Triggers
        triggers_description: 'The automation will run when any of these triggers run.',
        triggers_description_other: 'Other automations can also trigger this automation. | ' +
            '{n} other automation will trigger this automation. | ' +
            '{n} other automations will trigger this automation.',

        trigger_x: 'Trigger #{x}',
        remove_trigger: 'Remove trigger',

        add_trigger: 'Add trigger',

        // Conditions
        conditions_description: 'All of these conditions must be met for the automation\'s actions to run.',

        condition_x: 'Condition #{x}',
        remove_condition: 'Remove condition',

        add_condition: 'Add condition',

        // Actions
        action_x: 'Action #{x}',
        remove_action: 'Remove action',

        add_action: 'Add action',
    },

    scene_settings: {
        editor: 'Editor',
        other: 'Other',

        deleting: 'Deleting',
        saving: 'Saving',
        cancel: 'Cancel',
        delete: 'Delete',
        save: 'Save',
        done: 'Done',

        // General
        name: 'Name',

        // Active conditions
        conditions_description: 'All of these conditions must be met for the scene to be considered active.',

        add_condition: 'Add condition',

        // Activate actions
        activate_description: 'These actions will be run when activating this scene.',

        // Deactivate actions
        deactivate_description: 'These actions will be run when deactivating this scene.',

        add_action: 'Add action',
    },

    automation_triggers: {
        cron: {
            cron_expression: 'cron expression',
            timezone: 'Timezone',
        },

        scene: {
            scene: 'Scene',
        },
    },

    automation_conditions: {
        all: {
            description: 'All of these conditions must be met for this condition to pass.',
            add_condition: 'Add condition',
        },

        any: {
            description: 'One of these conditions must be met for this condition to pass.',
            add_condition: 'Add condition',
        },

        script: {
            description: 'This script must return {0} for this condition to pass.',
        },
    },

    automation_actions: {
        conditional: {
            description: 'These actions will only run if this condition passes.',
            no_condition: 'No condition selected.',
            add_condition: 'Add condition',
            add_action: 'Add action',
        },

        run_automation: {
            no_automations: 'You have no other automations.',
            skip_conditions: 'Skip conditions',
        },
    },
};
