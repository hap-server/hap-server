import Accessory from './accessory';
import Service, {ServiceEvents} from './service';
import Characteristic from './characteristic';

import {ServiceData} from '../common/types/storage';

class CollapsedService extends Service {
    readonly collapsed_service_uuid: string;
    readonly collapsed_service_type: string;
    services: Service[];

    constructor(accessory: Accessory, uuid: string, type: string, data: ServiceData, services?: Service[]) {
        super(accessory, uuid, {iid: 0, type: '', characteristics: []}, data);

        this.collapsed_service_uuid = uuid;
        this.collapsed_service_type = type;
        this.services = services || [];
    }

    addService(...services: Service[]) {
        for (const service of services) {
            this.services.push(service);
            this.emit('new-service', service);
        }

        this.emit('new-services', services);
    }

    removeService(...services: Service[]) {
        for (const service of services) {
            let index;
            while (index = this.services.indexOf(service)) this.services.splice(index, 1);
            this.emit('removed-service', service);
        }

        this.emit('removed-services', services);
    }

    async updateData(data: ServiceData) {
        const accessory_data = Object.assign({}, this.accessory.data);
        accessory_data['CollapsedService.' + this.collapsed_service_uuid] = data;
        await this.accessory.connection.setAccessoryData(this.accessory.uuid, accessory_data);
        this._setData(data, true);
    }

    get name() {
        return this.configured_name || this.default_name;
    }

    get configured_name(): string | null {
        return this.data.name || null;
    }

    get default_name() {
        return this.accessory.name;
    }

    get type() {
        return 'CollapsedService.' + this.collapsed_service_type;
    }

    findCharacteristic(callback: (characteristic: Characteristic) => boolean) {
        for (const service of this.services) {
            const characteristic = service.findCharacteristic(callback);

            if (characteristic) return characteristic;
        }
    }

    findCharacteristics(callback: (characteristic: Characteristic) => boolean) {
        const characteristics: Characteristic[] = [];

        for (const service of this.services) {
            characteristics.push(...service.findCharacteristics(callback));
        }

        return characteristics;
    }

    async setCharacteristics(values: {[uuid: string]: any}) {
        // TODO: send in one message
        await Promise.all(this.services.map(service => service.setCharacteristics(values)));
    }

    async setCharacteristicsByNames(values: {[name: string]: any}) {
        // TODO: send in one message
        await Promise.all(this.services.map(service => service.setCharacteristicsByNames(values)));
    }
}

type CollapsedServiceEvents = ServiceEvents & {
    'new-service': (this: CollapsedService, service: Service[]) => void;
    'new-services': (this: CollapsedService, services: Service[]) => void;
    'removed-service': (this: CollapsedService, service: Service[]) => void;
    'removed-services': (this: CollapsedService, services: Service[]) => void;
};

interface CollapsedService {
    addListener<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    on<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    once<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    prependListener<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    prependOnceListener<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    removeListener<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    off<E extends keyof CollapsedServiceEvents>(event: E, listener: CollapsedServiceEvents[E]): this;
    removeAllListeners<E extends keyof CollapsedServiceEvents>(event: E): this;
    listeners<E extends keyof CollapsedServiceEvents>(event: E): CollapsedServiceEvents[E][];
    rawListeners<E extends keyof CollapsedServiceEvents>(event: E): CollapsedServiceEvents[E][];

    emit<E extends keyof CollapsedServiceEvents>(event: E, ...data: any[]): boolean;

    listenerCount<E extends keyof CollapsedServiceEvents>(type: E): number;
}

export default CollapsedService;
