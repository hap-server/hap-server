
const {default: pluginapi, Service} = require('@hap-server/ui-api');
const {default: ServiceTile} = require('@hap-server/ui-api/service-tile');
const {default: ServiceDetails} = require('@hap-server/ui-api/service-details');
const {default: SensorIcon} = require('@hap-server/ui-api/icons/sensor');

const LightSensorService = {
    template: `<service-tile class="service-light-sensor" :service="service" type="Light Sensor">
        <sensor-icon slot="icon" />

        <p>{{ light }} lux</p>
    </service-tile>`,
    components: {
        ServiceTile,
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
setTimeout(() => pluginapi.registerServiceTileComponent(Service.LightSensor, LightSensorService), 1000);

const LightSensorAccessoryDetails = {
    template: `<service--details class="accessory-details-light-sensor"
        :name="service.name || service.accessory.name" @show-settings="$emit('show-settings')"
    >
        <p>Light Sensor</p>
        <p>{{ light }} lux</p>
    </service--details>`,
    components: {
        ServiceDetails,
    },
    props: ['connection', 'service'],
    computed: {
        light() {
            return this.service.getCharacteristicValueByName('CurrentAmbientLightLevel');
        },
    },
};

pluginapi.registerAccessoryDetailsComponent(Service.LightSensor, LightSensorAccessoryDetails);
