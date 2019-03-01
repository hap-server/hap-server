import Service from './service';

export default class CollapsedService extends Service {
    constructor(accessory, uuid, type, data, services) {
        super(accessory, uuid, {characteristics: []}, data);

        this.collapsed_service_type = type;
        this.services = services || [];
    }

    addService(...services) {
        for (const service of services) {
            this.services.push(service);
            this.emit('new-service', service);
        }

        this.emit('new-services', services);
    }

    removeService(...services) {
        for (const service of services) {
            let index;
            while (index = this.services.indexOf(service)) this.services.splice(index, 1);
            this.emit('removed-service', service);
        }

        this.emit('removed-services', services);
    }

    async updateData(data) {
        const accessory_data = Object.assign({}, this.accessory.data);
        accessory_data['CollapsedService.' + this.uuid] = data;
        await this.accessory.connection.setAccessoryData(this.accessory.uuid, accessory_data);
        this._setData(data, true);
    }

    get name() {
        return this.configured_name || this.default_name;
    }

    get configured_name() {
        return this.data.name;
    }

    get default_name() {
        return this.accessory.name;
    }

    get type() {
        return 'CollapsedService.' + this.collapsed_service_type;
    }

    findCharacteristic(callback) {
        for (const service of this.services) {
            const characteristic = service.findCharacteristic(callback);

            if (characteristic) return characteristic;
        }
    }

    findCharacteristics(callback) {
        const characteristics = [];

        for (const service of this.services) {
            characteristics.push(...service.findCharacteristics(callback));
        }

        return characteristics;
    }

    setCharacteristics(values) {
        // TODO: send in one message
        return Promise.all(this.services.map(service => service.setCharacteristics(values)));
    }

    setCharacteristicsByNames(values) {
        // TODO: send in one message
        return Promise.all(this.services.map(service => service.setCharacteristicsByNames(values)));
    }
}
