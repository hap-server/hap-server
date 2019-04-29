
import pluginapi, {Service} from '@hap-server/api/accessory-ui';
import ServiceComponent from '@hap-server/api/accessory-ui/service';
import AccessoryDetails from '@hap-server/api/accessory-ui/accessory-details';
import SensorIcon from '@hap-server/api/accessory-ui/icons/sensor';

const LightSensorService = {
    template: `<service class="service-light-sensor" :service="service" type="Light Sensor">
        <sensor-icon slot="icon" />

        <p>{{ light }} lux</p>
    </service>`,
    components: {
        Service: ServiceComponent,
        SensorIcon,
    },
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
