export default class ComponentRegistry<P, C> {
    private readonly builtin_components: Map<string | number, C> = new Map();
    private readonly plugin_components: Map<P, Map<string | number, C>> = new Map();

    // Force Vue to rerender when this property is updated
    private _vue = false;

    get(key: string | number): C | undefined {
        // Force Vue to watch this property
        this._vue;

        const c = this.builtin_components.get(key);
        if (c) return c;

        for (const components of this.plugin_components.values()) {
            const c = components.get(key);
            if (c) return c;
        }
    }

    has(key: string | number) {
        // Force Vue to watch this property
        this._vue;

        return this.builtin_components.has(key) || !![...this.plugin_components.values()].find(c => c.has(key));
    }

    set(key: string | number, value: C) {
        this.builtin_components.set(key, value);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    push(value: C) {
        let i = this.builtin_components.size;
        while (this.builtin_components.has(i)) i++;

        this.set(i, value);
    }

    addPluginComponent(ui_plugin: P, key: string | number, value: C) {
        let components = this.plugin_components.get(ui_plugin);
        if (!components) this.plugin_components.set(ui_plugin, components = new Map());

        if (components.has(key)) {
            throw new Error('Already registered a component with the ID ' + key);
        }

        components.set(key, value);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    pushPluginComponent(ui_plugin: P, value: C) {
        let components = this.plugin_components.get(ui_plugin);
        if (!components) this.plugin_components.set(ui_plugin, components = new Map());

        let i = components.size;
        while (components.has(i)) i++;

        components.set(i, value);

        // Force Vue to rerender
        this._vue = !this._vue;
    }

    removePluginComponents(ui_plugin: P) {
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

    find(filter: (component: C) => void) {
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
