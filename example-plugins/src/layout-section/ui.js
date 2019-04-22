
import pluginapi, {Layout} from 'hap-server-api/accessory-ui';
import LayoutSection from 'hap-server-api/accessory-ui/layout-section';
import Sortable from 'hap-server-api/accessory-ui/sortable';

// Must be globally unique
const LightsLayoutSectionType = 'FDC60D42-4F6D-4F38-BB3F-E6AB38EC8B87';

const LightsLayoutSection = {
    template: `<layout-section v-if="hasLights || editing" class="layout-section-example" :layout="layout"
        :section="section" :name="section.name" default-name="Lights" :editing="editing" @edit="$emit('edit', $event)"
        @update-name="$emit('update-name', $event)"
    >
        <p>Example custom layout section.</p>
    </layout-section>`,
    components: {
        LayoutSection,
        Sortable,
        Draggable: () => require.import('vuedraggable'),
    },
    props: {
        accessories: Object,
        layout: Layout,
        section: Object,
        accessoriesDraggableGroup: String,
        editing: Boolean,
    },
    computed: {
        hasLights() {
            return this.section.accessories && this.section.accessories.length;
        },
    },
};

pluginapi.registerLayoutSectionComponent(LightsLayoutSectionType, LightsLayoutSection, 'Lights');
