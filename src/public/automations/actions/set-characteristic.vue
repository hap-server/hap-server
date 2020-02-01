<template>
    <automation-action class="automation-action-set-characteristic"
        :id="id" :action="action" :editable="editable" :saving="saving" @delete="$emit('delete')"
    >
        <select v-model="accessory_uuid" class="custom-select custom-select-sm mb-3" :disabled="saving">
            <option v-for="a in Object.values(client.accessories)"
                :key="a.uuid" :value="a.uuid">{{ a.name || a.uuid }}</option>
        </select>

        <select v-if="accessory" v-model="service_id" class="custom-select custom-select-sm mb-3" :disabled="saving">
            <option v-for="s in Object.values(accessory.services)"
                :key="s.uuid" :value="s.uuid"
            >
                {{ s.name || s.uuid }}
                {{ s.type_name ? ' (' + s.type_name + ')' : '' }}
            </option>
        </select>

        <select v-if="service" v-model="characteristic_uuid" class="custom-select custom-select-sm mb-3"
            :disabled="saving"
        >
            <option v-for="c in Object.values(service.characteristics).filter(c => c.can_set)"
                :key="c.uuid" :value="c.uuid"
            >
                {{ c.description || c.type_name || c.uuid }}
            </option>
        </select>

        <div v-if="characteristic && (supported_types.length >= 2 || !supported_types.includes(type))"
            class="form-group row"
        >
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-type'">
                {{ $t('automation_actions.set_characteristic.type') }}
            </label>
            <div class="col-sm-9">
                <select v-model="type" class="custom-select custom-select-sm" :disabled="saving">
                    <option v-for="t in supported_types" :key="t" :value="t">
                        {{ $t('automation_actions.set_characteristic.type_' + t) }}
                    </option>
                </select>
            </div>
        </div>

        <div v-if="characteristic && type === 'set'" class="form-group row show-invalid-fields">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-value'">
                {{ $t('automation_actions.set_characteristic.value') }}
            </label>
            <div class="col-sm-9">
                <div v-if="characteristic.format === 'bool'" class="custom-control custom-checkbox">
                    <input v-model="action.value" :id="_uid + '-value'" type="checkbox"
                        class="custom-control-input" />
                    <label class="custom-control-label" :for="_uid + '-value'">
                        {{ $t('automation_actions.set_characteristic.' + (action.value ? 'true' : 'false')) }}
                    </label>
                </div>

                <select v-else-if="characteristic.valid_values" v-model="action.value"
                    class="custom-select custom-select-sm" :disabled="saving"
                >
                    <option v-for="v in characteristic.valid_values" :key="v" :value="v">{{ v }}</option>
                </select>

                <input v-else-if="is_numeric" :id="_uid + '-value'" :value="'' + action.value" type="number"
                    class="form-control form-control-sm" :disabled="saving" :min="characteristic.min_value"
                    :max="characteristic.max_value" :step="characteristic.min_step"
                    @input="e => !isNaN(parseFloat(e.target.value)) && $set(action, 'value', parseFloat(e.target.value))" />

                <input v-else :id="_uid + '-value'" v-model="action.value" type="text"
                    class="form-control form-control-sm" :disabled="saving" />
            </div>
        </div>

        <div v-if="characteristic && type === 'increase'" class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-value'">
                {{ $t('automation_actions.set_characteristic.increase_by') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-value'" :value="'' + action.increase" type="number"
                    class="form-control form-control-sm" :disabled="saving"
                    @input="e => !isNaN(parseFloat(e.target.value)) && $set(action, 'increase', parseFloat(e.target.value))" />
            </div>
        </div>

        <div v-if="characteristic && type === 'decrease'" class="form-group row">
            <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-value'">
                {{ $t('automation_actions.set_characteristic.decrease_by') }}
            </label>
            <div class="col-sm-9">
                <input :id="_uid + '-value'" :value="'' + action.decrease" type="number"
                    class="form-control form-control-sm" :disabled="saving"
                    @input="e => !isNaN(parseFloat(e.target.value)) && $set(action, 'decrease', parseFloat(e.target.value))" />
            </div>
        </div>
    </automation-action>
</template>

<script>
    import {ClientSymbol} from '../../internal-symbols';

    import AutomationAction from '../action.vue';

    export const type = 'SetCharacteristic';
    export const name = 'Set characteristic';

    export default {
        components: {
            AutomationAction,
        },
        props: {
            id: String,
            action: Object,
            editable: Boolean,
            saving: Boolean,
        },
        inject: {
            client: {from: ClientSymbol},
        },
        computed: {
            accessory_uuid: {
                get() {
                    return this.action.characteristic ? this.action.characteristic[0] || null : null;
                },
                set(accessory_uuid) {
                    this.$set(this.action, 'characteristic', [accessory_uuid]);
                },
            },
            accessory() {
                return this.client.accessories[this.accessory_uuid];
            },
            service_id: {
                get() {
                    return this.action.characteristic ? this.action.characteristic[1] || null : null;
                },
                set(service_id) {
                    this.$set(this.action, 'characteristic', [this.accessory_uuid, service_id]);
                },
            },
            service() {
                return this.accessory && this.accessory.services[this.service_id];
            },
            characteristic_uuid: {
                get() {
                    return this.action.characteristic ? this.action.characteristic[2] || null : null;
                },
                set(characteristic_uuid) {
                    this.$set(this.action, 'characteristic', [
                        this.accessory_uuid, this.service_id, characteristic_uuid,
                    ]);
                },
            },
            characteristic() {
                return this.service && this.service.characteristics[this.characteristic_uuid];
            },

            supported_types() {
                if (!this.characteristic) return [];

                const supported_types = [];

                supported_types.push('set');

                if (this.characteristic.can_get &&
                    ['int', 'float', 'uint8', 'uint16', 'uint32', 'uint64'].includes(this.characteristic.format)
                ) {
                    supported_types.push('increase', 'decrease');
                }

                return supported_types;
            },
            is_numeric() {
                if (!this.characteristic) return false;
                return ['int', 'float', 'uint8', 'uint16', 'uint32', 'uint64'].includes(this.characteristic.format);
            },

            type: {
                get() {
                    return 'value' in this.action ? 'set' :
                        'increase' in this.action ? 'increase' :
                        'decrease' in this.action ? 'decrease' :
                        'set';
                },
                set(type) {
                    const value = this.value;

                    if (type !== 'set') this.$delete(this.action, 'value');
                    if (type !== 'increase') this.$delete(this.action, 'increase');
                    if (type !== 'decrease') this.$delete(this.action, 'decrease');

                    if (type === 'increase') this.$set(this.action, 'increase', parseFloat(value));
                    else if (type === 'decrease') this.$set(this.action, 'decrease', parseFloat(value));
                    else this.$set(this.action, 'value', value);
                },
            },
            value: {
                get() {
                    if (this.type === 'set') return this.action.value;
                    if (this.type === 'increase') return this.action.increase;
                    if (this.type === 'decrease') return this.action.decrease;

                    return undefined;
                },
                set(value) {
                    if (this.type === 'set') this.$set(this.action, 'value', value);
                    if (this.type === 'increase') this.$set(this.action, 'increase', parseFloat(value));
                    if (this.type === 'decrease') this.$set(this.action, 'decrease', parseFloat(value));
                },
            },
        },
        created() {
            this.client.loadAccessories(this);
        },
        destroyed() {
            this.client.unloadAccessories(this);
        },
    };
</script>
