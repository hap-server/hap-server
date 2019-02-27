
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import {Bridge as HAPBridge, Accessory, Service, Characteristic} from './hap-async';

export default class Bridge {
    constructor(server, log, config) {
        this.server = server;
        this.log = log;

        if (!config || !config.uuid) {
            throw new Error('No UUID specified in bridge configuration');
        }

        this.uuid = config.uuid;
        this.name = config.name || 'Homebridge';
        this.username = config.username || 'CC:22:3D:E3:CE:30';
        this.port = config.port || 0;
        this.pincode = config.pincode || '031-45-154',
        this.unauthenticated_access = config.unauthenticated_access || false;

        if (config._no_bridge) return;

        this.bridge = new HAPBridge(this.name, config.uuid);
        this.bridge.on('listening', port => {
            this.log.info('Homebridge is running on port %s.', port);
        });

        Object.freeze(this);

        this.bridge.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'Samuel Elliott')
            .setCharacteristic(Characteristic.Model, 'Homebridge')
            .setCharacteristic(Characteristic.SerialNumber, this.username)
            .setCharacteristic(Characteristic.FirmwareRevision, require('../../package').version);

        this.bridge.on('service-characteristic-change', event => {
            // this.log.info('Updating characteristic', event);
            this.server.handleCharacteristicUpdate(event.accessory || this.bridge, event.service,
                event.characteristic, event.newValue, event.oldValue, event.context);
        });

        const addBridgedAccessory = this.bridge.addBridgedAccessory;

        this.bridge.addBridgedAccessory = (accessory, defer_update, ...args) => {
            accessory.on('service-characteristic-change', event => {
                // this.log.info('Updating characteristic', accessory, event);
                this.server.handleCharacteristicUpdate(event.accessory || accessory, event.service,
                    event.characteristic, event.newValue, event.oldValue, event.context);
            });

            return addBridgedAccessory.call(this.bridge, accessory, defer_update, ...args);
        };
    }

    publish() {
        return this.bridge.publish({
            username: this.username,
            port: this.port,
            pincode: this.pincode,
            category: Accessory.Categories.BRIDGE,
            // setupID: this.setup_id && this.setup_id.length === 3 ? this.setup_id : undefined,
        }, this.allow_insecure_access);
    }

    unpublish() {
        this.bridge.unpublish();
    }

    addAccessory(accessory) {
        this.bridge.addBridgedAccessory(accessory);
    }

    removeAccessory(accessory) {
        this.bridge.removeBridgeAccessory(accessory);
    }

    printSetupInfo() {
        console.log('Setup payload:', this.bridge.setupURI());

        console.log('Scan this code with your HomeKit app on your iOS device to pair with Homebridge:');
        qrcode.generate(this.bridge.setupURI());

        console.log('Or enter this code with your HomeKit app on your iOS device to pair with Homebridge:');
        console.log(chalk.black.bgWhite('                       '));
        console.log(chalk.black.bgWhite('    ┌────────────┐     '));
        console.log(chalk.black.bgWhite('    │ ' + this.pincode + ' │     '));
        console.log(chalk.black.bgWhite('    └────────────┘     '));
        console.log(chalk.black.bgWhite('                       '));
    }
}
