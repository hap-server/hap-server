export default {
    menu: {
        menu: 'Menu',
        home: 'Home',
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

    main: {
        home: 'Home',
        settings: 'Settings',
        automations: 'Automations',

        connecting: 'Connecting',
        reconnecting: 'Reconnecting',

        errors: {
            ignore: 'Ignore',
        },
    },

    modal: {
        try_again: 'Try again',
        cancel: 'Cancel',
        loading: 'Loading',
        invalid: 'Invalid modal.',
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

        status_waiting: 'Connecting',
        status_destroyed: 'Removed',
        status_error: 'Not responding',
        status_connecting: 'Connecting',
        status_disconnecting: 'Disconnecting',
        status_unknown: 'Not responding',

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

    scenes: {
        scenes: {
            scenes: 'Scenes',
            new: 'New',
            add: 'Add scene',
        },

        scene: {
            unknown: 'Unknown',
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

    modals: {
        login: 'Login',
        settings: 'Settings',
        add_accessory: 'Add accessory',
        layout_settings: '{name} Settings',
        new_layout: 'New layout',
        delete_layout: 'Delete {name}?',
        accessory_settings: '{name} Settings',
        accessory_platform_settings: 'Accessory platform settings - {uuid}',
        new_bridge: 'New bridge',
        delete_bridge: 'Delete {name}?',
        pairing_settings: '{name} Settings',
        service_settings: '{name} Settings',
        scene_settings: '{name} Settings',
        new_scene: 'New scene',
        setup: 'Setup',
    },

    settings: {
        loading: 'Loading',
        saving: 'Saving',
        cancel: 'Cancel',
        save: 'Save',
        done: 'Done',

        unsaved_in_other_tab: 'You have unsaved changes in another tab',

        // General
        general: 'General',
        name: 'Name',
        wallpaper: 'Wallpaper',
        choose_file: 'Choose file',

        // Users
        users: 'Users',
        location: 'Location',
        location_description: 'This device will be used to track this user\'s location for location based automations.',

        permissions: {
            permissions: 'Permissions',

            admin: 'Admin',
            admin_warning: 'This will give this user full access to the server as the user running hap-server.',

            get_home_settings: 'Access home',
            set_home_settings: 'Update home settings',

            server_runtime_info: 'Access server info',
            web_console: 'Access web console',
            web_console_warning: 'This will give this user full access to the server as the user running hap-server.',

            manage_users: 'Manage users',
            manage_permissions: 'Manage user permissions',
            manage_permissions_warning: 'This will allow this user to give themself any permissions you don\'t allow.',
            manage_pairings: 'Manage pairing',

            create_accessories: 'Create accessories',
            create_layouts: 'Create layouts',
            create_automations: 'Create automations',
            create_scenes: 'Create scenes',
            create_bridges: 'Create bridges',

            accessories_bridges: 'Accessories and bridges',
            layouts: 'Layouts',
            scenes: 'Scenes',

            default: 'Default',
            unknown_accessory: 'Unknown {uuid}',
            add: 'Add',
            remove: 'Remove',

            view: 'View',
            read: 'Read',
            activate: 'Activate',
            write: 'Write',
            edit: 'Edit',
            manage: 'Manage',
            configure: 'Configure',
            delete: 'Delete',
        },

        save_permissions: 'Save permissions',

        // Accessories
        accessories: 'Accessories',
        add_accessory: 'Add accessory',
        refresh_accessories: 'Refresh accessories',

        // Bridges
        bridges: 'Bridges',
        new_bridge: 'New bridge',

        // Output
        output: 'Output',
        command: 'Command',

        // Console
        console: 'Console',
        status: 'Status',
    },

    accessory_settings: {
        delete_bridge_info: 'Are you sure you want to delete this bridge?',

        name: 'Name',
        room: 'Room',
        configuration_unavailable_homebridge:
            'Configuration is not available for this accessory as it is provided by Homebridge.',
        accessory_platform_configuration_info: 'This accessory is provided by an accessory platform.',
        accessory_platform_configuration: 'Configure',
        services: 'Services',
        other_accessories: 'Other accessories',

        username: 'Device ID',
        username_info: 'Leave blank to generate a device ID',
        setup_code: 'Setup code',
        port: 'Port',
        port_info: 'Use a random port',

        manufacturer: 'Manufacturer',
        model: 'Model',
        serial_number: 'Serial Number',
        firmware_revision: 'Firmware',
        hardware_revision: 'Hardware Revision',

        pair_setup_info: 'Enter the code {pincode} or scan this QR code to pair with this bridge:',
        setup_payload: 'Setup payload:',

        pairings_info: 'Each Apple ID your home is shared with has it\'s own pairing. You can assign each pairing a name if you know which device/Apple ID it is for.',

        delete: 'Delete',
        reset_pairings: 'Reset pairings',
        loading: 'Loading',
        saving: 'Saving',
        identify: 'Identify',
        cancel: 'Cancel',
        create: 'Create',
        save: 'Save',
        done: 'Done',
        unsaved_in_other_tab: 'You have unsaved changes in another tab',

        general: 'General',
        configuration: 'Configuration',
        accessories: 'Accessories',
        pairings: 'Pairings',
    },

    pairing_settings: {
        name: 'Name',
        username: 'Pairing ID',
        public_key: 'Public key',

        saving: 'Saving',
        cancel: 'Cancel',
        save: 'Save',
        done: 'Done',
    },

    service_settings: {
        name: 'Name',
        room: 'Room',

        saving: 'Saving',
        accessory_settings: 'Accessory settings',
        cancel: 'Cancel',
        save: 'Save',
        done: 'Done',
    },

    layout_settings: {
        delete_info: 'Are you sure you want to delete this layout?',

        name: 'Name',
        wallpaper: 'Wallpaper',
        choose_file: 'Choose file',

        deleting: 'Deleting',
        saving: 'Saving',
        cancel: 'Cancel',
        delete: 'Delete',
        create: 'Create',
        save: 'Save',
        done: 'Done',
    },

    add_accessory: {
        discovered_accessories: 'Discovered accessories',
        other: 'Other',
        saving: 'Saving',
        cancel: 'Cancel',
    },

    accessory_discovery: {
        unknown: 'Unknown',
    },

    accessory_setup: {
        hap_ip: {
            manual: 'Manual',
            saving: 'Saving',
            cancel: 'Cancel',
        },
    },

    setup: {
        token: 'Token',

        loading: 'Loading',
        next: 'Next',
        done: 'Done',

        finished_1: 'You are now authenticated to the server.',
        finished_2: 'You should now setup your own user using a plugin with an authentication handler.',
        finished_3: 'Once you login with your own account setup will be disabled.',
    },

    authenticate: {
        no_authentication_handlers: 'No authentication handlers',
        no_authentication_handlers_info: 'There are no authentication handlers configured.',

        handler: 'Handler',

        logout: 'Logout',
        cancel: 'Cancel',
    },
};
