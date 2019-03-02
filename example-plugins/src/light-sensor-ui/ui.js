
import pluginapi, {Service} from 'hap-server-api/accessory-ui';
import AccessoryDetails from 'hap-server-api/accessory-ui/accessory-details';

const LightSensorService = {
    template: `<div class="service service-light-sensor">
        <h5>{{ service.name || service.accessory.name }}</h5>
        <p>Light Sensor</p>
        <p>{{ light }} lux</p>
    </div>`,
    props: ['connection', 'service'],
    computed: {
        light() {
            return this.service.getCharacteristicValueByName('CurrentAmbientLightLevel');
        },
    },
};

// pluginapi.registerServiceComponent(Service.LightSensor, LightSensor);

// Test refreshing display services
setTimeout(() => pluginapi.registerServiceComponent(Service.LightSensor, LightSensorService), 1000);

const LightSensorAccessoryDetails = {
    template: `<accessory-details class="accessory-details-light-sensor" :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')">
        <p>Light Sensor</p>
        <p>{{ light }} lux</p>
    </accessory-details>`,
    components: {
        AccessoryDetails,
    },
    props: ['connection', 'service'],
    computed: {
        light() {
            return this.service.getCharacteristicValueByName('CurrentAmbientLightLevel');
        },
    },
};

pluginapi.registerAccessoryDetailsComponent(Service.LightSensor, LightSensorAccessoryDetails);
