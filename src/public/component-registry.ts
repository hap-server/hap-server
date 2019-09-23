import {Component} from 'vue';

class ComponentRegistry {
    private readonly builtin_components: Map<string | number, Component> = new Map();
    private readonly plugin_components: Map<any, Map<string | number, Component>> = new Map();

    // Force Vue to rerender when this property is updated
    private _vue = false;

    get(key: string): Component {
        // Force Vue to watch this property
        this._vue;

        const c = this.builtin_components.get(key);
        if (c) return c;

        for (const components of this.plugin_components.values()) {
            const c = components.get(key);
            if (c) return c;
        }
    }

    has(key: string) {
        // Force Vue to watch this property
        this._vue;

        return this.builtin_components.has(key) || !![...this.plugin_components.values()].find(c => c.has(key));
    }

    set(key: string | number, value: Component) {
        this.builtin_components.set(key, value);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    push(value: Component) {
        let i = this.builtin_components.size;
        while (this.builtin_components.has(i)) i++;

        this.set(i, value);
    }

    addPluginComponent(ui_plugin, key: string, value: Component) {
        let components = this.plugin_components.get(ui_plugin);
        if (!components) this.plugin_components.set(ui_plugin, components = new Map());

        if (components.has(key)) {
            throw new Error('Already registered a component with the ID ' + key);
        }

        components.set(key, value);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    pushPluginComponent(ui_plugin, key: string, value: Component) {
        let components = this.plugin_components.get(ui_plugin);
        if (!components) this.plugin_components.set(ui_plugin, components = new Map());

        let i = components.size;
        while (components.has(i)) i++;

        components.set(i, value);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    removePluginComponents(ui_plugin) {
        this.plugin_components.delete(ui_plugin);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    get size() {
        return [...this.keys()].length;
    }

    keys() {
        // Force Vue to watch this property
        this._vue;

        return [...this.builtin_components.keys()]
            .concat(...[...this.plugin_components.values()].map(c => [...c.keys()]));
    }

    values() {
        // Force Vue to watch this property
        this._vue;

        return [...this.builtin_components.values()]
            .concat(...[...this.plugin_components.values()].map(c => [...c.values()]));
    }

    [Symbol.iterator]() {
        return this.values()[Symbol.iterator]();
    }

    entries() {
        // Force Vue to watch this property
        this._vue;

        return [...this.builtin_components.entries()]
            .concat(...[...this.plugin_components.values()].map(c => [...c.entries()]));
    }

    find(filter: (component: Component) => void) {
        for (const component of this.builtin_components.values()) {
            if (filter.call(null, component)) return component;
        }

        for (const components of this.plugin_components.values()) {
            for (const component of components) {
                if (filter.call(null, component)) return component;
            }
        }
    }
}

export const ServiceTileComponents = new ComponentRegistry();
export const ServiceDetailsComponents = new ComponentRegistry();
export const ServiceSettingsComponents = new ComponentRegistry();
export const LayoutSectionComponents = new ComponentRegistry();
export const AccessoryDiscoveryComponents = new ComponentRegistry();
export const AccessorySetupComponents = new ComponentRegistry();
export const AuthenticationHandlerComponents = new ComponentRegistry();
export const UserManagementHandlers = new ComponentRegistry();
export const AutomationTriggerComponents = new ComponentRegistry();
export const AutomationConditionComponents = new ComponentRegistry();
export const AutomationActionComponents = new ComponentRegistry();

// @ts-ignore
global.components = {
    ServiceTileComponents,
    ServiceDetailsComponents,
    ServiceSettingsComponents,
    LayoutSectionComponents,
    AccessoryDiscoveryComponents,
    AccessorySetupComponents,
    AuthenticationHandlerComponents,
    UserManagementHandlers,
    AutomationTriggerComponents,
    AutomationConditionComponents,
    AutomationActionComponents,
};
