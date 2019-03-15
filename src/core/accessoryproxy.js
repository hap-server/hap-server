
import {Accessory, Service, Characteristic} from './hap-async';

export default class AccessoryProxy extends Accessory {
    constructor(accessory, permissions) {
        super(accessory.displayName, accessory.UUID);

        this._services = [];

        this.accessory = accessory;
        this.permissions = permissions || [
            Characteristic.Perms.PAIRED_READ,
            Characteristic.Perms.PAIRED_WRITE,
            Characteristic.Perms.EVENTS,
            Characteristic.Perms.ADDITIONAL_AUTHORIZATION,
            Characteristic.Perms.TIMED_WRITE,
            Characteristic.Perms.HIDDEN,
            Characteristic.Perms.WRITE_RESPONSE,
        ];
    }

    get _events() {
        return this.accessory ? this.accessory._events : Object.create(null);
    }
    get _eventsCount() {
        return this.accessory ? this.accessory._eventsCount : 0;
    }
    set _eventsCount(_eventsCount) {
        return this.accessory ? this.accessory._eventsCount = _eventsCount : 0;
    }
    get _maxListeners() {
        return this.accessory ? this.accessory._maxListeners : undefined;
    }
    set _maxListeners(_maxListeners) {
        return this.accessory ? this.accessory._maxListeners = _maxListeners : undefined;
    }

    get displayName() {
        return this.accessory ? this.accessory.displayName : undefined;
    }
    set displayName(displayName) {
        return this.accessory ? this.accessory.displayName = displayName : undefined;
    }

    get UUID() {
        return this.accessory ? this.accessory.UUID : undefined;
    }
    set UUID(UUID) {
        return this.accessory ? this.accessory.UUID = UUID : undefined;
    }

    // get aid() {}
    // set aid(aid) {}

    get _isBridge() {
        return this.accessory ? this.accessory._isBridge : undefined;
    }
    set _isBridge(_isBridge) {
        return this.accessory ? this.accessory._isBridge = _isBridge : undefined;
    }

    get bridged() {
        return this.accessory ? this.accessory.bridged : undefined;
    }
    set bridged(bridged) {
        return this.accessory ? this.accessory.bridged = bridged : undefined;
    }

    get bridgedAccessories() {
        if (!this._bridgedAccessories) this._bridgedAccessories = [];

        if (this.accessory) {
            //
        }

        return this._bridgedAccessories;
    }
    set bridgedAccessories(bridgedAccessories) {
        if (this.accessory) throw new Error('Cannot set bridgedAccessories');
    }

    get reachable() {
        return this.accessory ? this.accessory.reachable : undefined;
    }
    set reachable(reachable) {
        return this.accessory ? this.accessory.reachable = reachable : undefined;
    }

    get category() {
        return this.accessory ? this.accessory.category : undefined;
    }
    set category(category) {
        return this.accessory ? this.accessory.category = category : undefined;
    }

    get services() {
        if (!this._services) this._services = [];

        if (this.accessory) {
            for (const service of this.accessory.services) {
                const proxy = this._services.find(p => p.UUID === service.UUID && p.subtype === service.subtype);

                if (!proxy) this._services.push(new ServiceProxy(service, this.permissions));
            }

            for (const proxy of this._services) {
                const service = this.accessory.services.find(s => s.UUID === proxy.UUID && s.subtype === proxy.subtype);

                if (!service) {
                    let index;
                    while ((index = this._services.indexOf(proxy)) !== -1) this._services.splice(index, 1);
                }
            }
        }

        return this._services;
    }
    set services(services) {
        if (this.accessory) throw new Error('Cannot set services');
    }

    get cameraSource() {
        return this.accessory ? this.accessory.cameraSource : undefined;
    }
    set cameraSource(cameraSource) {
        return this.accessory ? this.accessory.cameraSource = cameraSource : undefined;
    }

    // get shouldPurgeUnusedIDs() {
    //     return this.accessory ? this.accessory.shouldPurgeUnusedIDs : undefined;
    // }
    // set shouldPurgeUnusedIDs(shouldPurgeUnusedIDs) {
    //     return this.accessory ? this.accessory.shouldPurgeUnusedIDs = shouldPurgeUnusedIDs : undefined;
    // }

    addService() {
        if (!this.accessory) return this.__proto__.__proto__.addService.apply(this, arguments);

        throw new Error('Cannot add services to accessory proxies');
    }

    setPrimaryService() {
        if (!this.accessory) return this.__proto__.__proto__.setPrimaryService.apply(this, arguments);

        throw new Error('Cannot set primary service of accessory proxies');
    }

    removeService() {
        if (!this.accessory) return this.__proto__.__proto__.removeService.apply(this, arguments);

        throw new Error('Cannot remove services from accessory proxies');
    }

    addBridgedAccessory() {
        if (!this.accessory) return this.__proto__.__proto__.addBridgedAccessory.apply(this, arguments);

        throw new Error('Cannot add bridged accessories to accessory proxies');
    }

    removeBridgedAccessory() {
        if (!this.accessory) return this.__proto__.__proto__.removeBridgedAccessory.apply(this, arguments);

        throw new Error('Cannot remove bridged accessories from accessory proxies');
    }

    configureCameraSource() {
        if (!this.accessory) return this.__proto__.__proto__.configureCameraSource.apply(this, arguments);

        throw new Error('Cannot configure camera sources of accessory proxies');
    }
}

export class ServiceProxy extends Service {
    constructor(service, permissions) {
        super(service.displayName, service.UUID, service.subtype);

        this._characteristics = [];
        this._optionalCharacteristics = [];

        this.service = service;
        this.permissions = permissions || [
            Characteristic.Perms.PAIRED_READ,
            Characteristic.Perms.PAIRED_WRITE,
            Characteristic.Perms.EVENTS,
            Characteristic.Perms.ADDITIONAL_AUTHORIZATION,
            Characteristic.Perms.TIMED_WRITE,
            Characteristic.Perms.HIDDEN,
            Characteristic.Perms.WRITE_RESPONSE,
        ];
    }

    get _events() {
        return this.service ? this.service._events : Object.create(null);
    }
    get _eventsCount() {
        return this.service ? this.service._eventsCount : 0;
    }
    set _eventsCount(_eventsCount) {
        return this.service ? this.service._eventsCount = _eventsCount : 0;
    }
    get _maxListeners() {
        return this.service ? this.service._maxListeners : undefined;
    }
    set _maxListeners(_maxListeners) {
        return this.service ? this.service._maxListeners = _maxListeners : undefined;
    }

    get displayName() {
        return this.service ? this.service.displayName : undefined;
    }
    set displayName(displayName) {
        return this.service ? this.service.displayName = displayName : undefined;
    }

    get UUID() {
        return this.service ? this.service.UUID : undefined;
    }
    set UUID(UUID) {
        return this.service ? this.service.UUID = UUID : undefined;
    }

    get subtype() {
        return this.service ? this.service.subtype : undefined;
    }
    set subtype(subtype) {
        return this.service ? this.service.subtype = subtype : undefined;
    }

    // get iid() {}
    // set iid(iid) {}

    get characteristics() {
        if (!this._characteristics) this._characteristics = [];

        if (this.service) {
            for (const characteristic of this.service.characteristics) {
                const proxy = this._characteristics.find(p => p.UUID === characteristic.UUID);

                if (!proxy) this._characteristics.push(new CharacteristicProxy(characteristic, this.permissions));
            }

            for (const proxy of this._characteristics) {
                const characteristic = this.service.characteristics.find(c => c.UUID === proxy.UUID);

                if (!characteristic) {
                    let index;
                    while ((index = this._characteristics.indexOf(proxy)) !== -1) this._characteristics.splice(index, 1);
                }
            }
        }

        return this._characteristics;
    }
    set characteristics(characteristics) {
        if (this.service) throw new Error('Cannot set characteristics');
    }

    get optionalCharacteristics() {
        if (!this._optionalCharacteristics) this._optionalCharacteristics = [];

        if (this.service) {
            for (const characteristic of this.service.optionalCharacteristics) {
                const proxy = this._optionalCharacteristics.find(p => p.UUID === characteristic.UUID);

                if (!proxy) this._optionalCharacteristics.push(new CharacteristicProxy(characteristic, this.permissions));
            }

            for (const proxy of this._optionalCharacteristics) {
                const characteristic = this.service.optionalCharacteristics.find(c => c.UUID === proxy.UUID);

                if (!characteristic) {
                    let index;
                    while ((index = this._optionalCharacteristics.indexOf(proxy)) !== -1) this._optionalCharacteristics.splice(index, 1);
                }
            }
        }

        return this._optionalCharacteristics;
    }
    set optionalCharacteristics(optionalCharacteristics) {
        if (this.service) throw new Error('Cannot set optionalCharacteristics');
    }

    get isHiddenService() {
        return this.service ? this.service.isHiddenService : undefined;
    }
    set isHiddenService(isHiddenService) {
        return this.service ? this.service.isHiddenService = isHiddenService : undefined;
    }

    get isPrimaryService() {
        return this.service ? this.service.isPrimaryService : undefined;
    }
    set isPrimaryService(isPrimaryService) {
        return this.service ? this.service.isPrimaryService = isPrimaryService : undefined;
    }

    get linkedServices() {
        if (!this._linkedServices) this._linkedServices = [];

        if (this.service) {
            for (const service of this.service.linkedServices) {
                const proxy = this._linkedServices.find(p => p.UUID === service.UUID && p.subtype === service.subtype);

                if (!proxy) this._linkedServices.push(new ServiceProxy(service, this.permissions));
            }

            for (const proxy of this._linkedServices) {
                const service = this.service.linkedServices.find(s => s.UUID === proxy.UUID && s.subtype === proxy.subtype);

                if (!service) {
                    let index;
                    while ((index = this._linkedServices.indexOf(proxy)) !== -1) this._linkedServices.splice(index, 1);
                }
            }
        }

        return this._linkedServices;
    }
    set linkedServices(services) {
        if (this.accessory) throw new Error('Cannot set linkedServices');
    }

    addCharacteristic() {
        if (!this.service) return this.__proto__.__proto__.addCharacteristic.apply(this, arguments);

        // throw new Error('Cannot add characteristics to service proxies');
    }

    setHiddenService() {
        if (!this.service) return this.__proto__.__proto__.setHiddenService.apply(this, arguments);

        throw new Error('Cannot set hidden service property of service proxies');
    }

    addLinkedService() {
        if (!this.service) return this.__proto__.__proto__.addLinkedService.apply(this, arguments);

        throw new Error('Cannot add linked services to service proxies');
    }

    removeLinkedService() {
        if (!this.service) return this.__proto__.__proto__.removeLinkedService.apply(this, arguments);

        throw new Error('Cannot remove linked services from service proxies');
    }

    removeCharacteristic() {
        if (!this.service) return this.__proto__.__proto__.removeCharacteristic.apply(this, arguments);

        throw new Error('Cannot remove characteristics from service proxies');
    }

    getCharacteristic(name) {
        if (!this.service) return this.__proto__.__proto__.getCharacteristic.apply(this, arguments);

        const characteristic = this.service.getCharacteristic(name);

        const proxy = this._characteristics.find(p => p.UUID === characteristic.UUID);
        if (proxy) return proxy;

        const nproxy = new CharacteristicProxy(characteristic, this.permissions);
        this._characteristics.push(nproxy);
        return nproxy;
    }

    addOptionalCharacteristic() {
        if (!this.service) return this.__proto__.__proto__.addOptionalCharacteristic.apply(this, arguments);

        throw new Error('Cannot add optional characteristics to service proxies');
    }
}

export class CharacteristicProxy extends Characteristic {
    constructor(characteristic, permissions) {
        super(characteristic.displayName, characteristic.UUID);

        this.characteristic = characteristic;
        this.permissions = permissions || [
            Characteristic.Perms.PAIRED_READ,
            Characteristic.Perms.PAIRED_WRITE,
            Characteristic.Perms.EVENTS,
            Characteristic.Perms.ADDITIONAL_AUTHORIZATION,
            Characteristic.Perms.TIMED_WRITE,
            Characteristic.Perms.HIDDEN,
            Characteristic.Perms.WRITE_RESPONSE,
        ];
    }

    get _events() {
        return this.characteristic ? this.characteristic._events : Object.create(null);
    }
    get _eventsCount() {
        return this.characteristic ? this.characteristic._eventsCount : 0;
    }
    set _eventsCount(_eventsCount) {
        return this.characteristic ? this.characteristic._eventsCount = _eventsCount : 0;
    }
    get _maxListeners() {
        return this.characteristic ? this.characteristic._maxListeners : undefined;
    }
    set _maxListeners(_maxListeners) {
        return this.characteristic ? this.characteristic._maxListeners = _maxListeners : undefined;
    }

    get displayName() {
        return this.characteristic ? this.characteristic.displayName : undefined;
    }
    set displayName(displayName) {
        return this.characteristic ? this.characteristic.displayName = displayName : undefined;
    }

    get UUID() {
        return this.characteristic ? this.characteristic.UUID : undefined;
    }
    set UUID(UUID) {
        return this.characteristic ? this.characteristic.UUID = UUID : undefined;
    }

    // get iid() {}
    // set iid(iid) {}

    get value() {
        return this.characteristic ? this.characteristic.value : undefined;
    }
    set value(value) {
        return this.characteristic ? this.characteristic.value = value : undefined;
    }

    get status() {
        return this.characteristic ? this.characteristic.status : undefined;
    }
    set status(status) {
        return this.characteristic ? this.characteristic.status = status : undefined;
    }

    get eventOnlyCharacteristic() {
        return this.characteristic ? this.characteristic.eventOnlyCharacteristic : undefined;
    }
    set eventOnlyCharacteristic(eventOnlyCharacteristic) {
        return this.characteristic ? this.characteristic.eventOnlyCharacteristic = eventOnlyCharacteristic : undefined;
    }

    get props() {
        return this.characteristic ? Object.assign({}, this.characteristic.props, {
            perms: (this.characteristic.props.perms || []).filter(p => this.permissions.includes(p)),
        }) : undefined;
    }
    set props(props) {
        return this.characteristic ? this.characteristic.props = props : undefined;
    }

    get subscriptions() {
        return this.characteristic ? this.characteristic.subscriptions : undefined;
    }
    set subscriptions(subscriptions) {
        return this.characteristic ? this.characteristic.subscriptions = subscriptions : undefined;
    }

    setProps() {
        if (!this.characteristic) return this.__proto__.__proto__.setProps.apply(this, arguments);

        throw new Error('Cannot set props of characteristic proxies');
    }
}
