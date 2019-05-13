<script>
    export default {
        props: {
            sorted: {type: Array, default: () => []},
            idProp: {type: String, default: 'key'},
            filterText: Boolean,
        },
        data() {
            return {
                sorted_cache: [],
            };
        },
        watch: {
            sorted(sorted) {
                this.sorted_cache = sorted;
            },
        },
        created() {
            this.sorted_cache = this.sorted;
        },
        render(createElement) {
            const children = this.$slots.default || [];
            const sorted_components = [];

            for (const id of this.sorted_cache || []) {
                const child = children.find(vnode => vnode.data && vnode.data[this.idProp] === id);

                if (!child || sorted_components.includes(child)) continue;

                sorted_components.push(child);
            }

            for (const child of children) {
                if (this.filterText && !child.componentOptions) continue;

                if (!sorted_components.includes(child)) sorted_components.push(child);
            }

            return createElement('div', sorted_components);
        },
    };
</script>
