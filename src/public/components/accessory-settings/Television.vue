<template>
    <div v-if="inputs.length" class="accessory-settings accessory-settings-television mt-3">
        <h5>Inputs</h5>

        <div v-for="(input, index) in inputs" :key="input.uuid" class="form-group d-flex"
            :class="{'mb-0': index === inputs.length - 1}"
        >
            <div class="custom-control custom-checkbox">
                <input :id="_uid + '-' + input.uuid + '-enabled'" type="checkbox" class="custom-control-input"
                    :checked="checkInputEnabled(input)"
                    :disabled="!input.getCharacteristicByName('TargetVisibilityState') ||
                        !input.getCharacteristicByName('TargetVisibilityState').can_set"
                    @change="input.setCharacteristicByName('TargetVisibilityState',
                        input.getCharacteristicValueByName('TargetVisibilityState') === 1 ? 0 : 1)" /> <!-- eslint-disable-line vue/html-indent -->
                <label class="custom-control-label" :for="_uid + '-' + input.uuid + '-enabled'" />
            </div>

            <input ref="name" :id="_uid + '-' + input.uuid + '-name'" type="text" class="form-control form-control-sm"
                :value="input.getCharacteristicValueByName('ConfiguredName')"
                :placeholder="input.getCharacteristicValueByName('Name')"
                :disabled="!input.getCharacteristicByName('ConfiguredName') ||
                    !input.getCharacteristicByName('ConfiguredName').can_set"
                @input="value => input.setCharacteristicByName('ConfiguredName', $refs.name[index].value)" />
        </div>
    </div>
</template>

<script>
    import Service from '../../../client/service';

    export const uuid = 'CollapsedService.' + Service.Television;

    export default {
        props: {
            service: Service,
        },
        computed: {
            inputs() {
                return this.service.services.filter(service => service.type === Service.InputSource);
            },
        },
        methods: {
            checkInputEnabled(input) {
                const target = input.getCharacteristicByName('TargetVisibilityState');

                if (!target) return input.getCharacteristicValueByName('CurrentVisibilityState') === 0; // SHOWN
                return input.getCharacteristicValueByName('TargetVisibilityState') === 0; // 0 === SHOWN
            },
        },
    };
</script>
