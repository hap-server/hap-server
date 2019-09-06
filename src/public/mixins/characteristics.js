
import Characteristic from '../../client/characteristic';

export default {
    watch: {
        subscribedCharacteristics(characteristics, old_characteristics) {
            for (const characteristic of old_characteristics) !characteristic || characteristic.unsubscribe(this);
            for (const characteristic of characteristics) !characteristic || characteristic.subscribe(this);
        },
    },
    created() {
        for (const characteristic of this.subscribedCharacteristics) {
            if (!characteristic) continue;

            characteristic.subscribe(this);
        }
    },
    destroyed() {
        Characteristic.unsubscribeAll(this);
    },
};
