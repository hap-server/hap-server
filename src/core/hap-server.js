
import {HAPServer, Accessory} from 'hap-nodejs';
import {Advertiser} from 'hap-nodejs/lib/Advertiser';

function hapStatus(err) {
    let value = 0;

    for (const k in HAPServer.Status) {
        if (err.message !== HAPServer.Status[k]) continue;

        value = err.message;
        break;
    }

    if (value === 0) value = HAPServer.Status.SERVICE_COMMUNICATION_FAILURE; // Default if not found or 0

    return parseInt(value);
}

export default class Server {
    /**
     * Creates a HAPServer.
     *
     * @param {HAPBridge} bridge
     * @param {object} config
     * @param {number} config.port
     * @param {boolean} config.unauthenticated_access
     * @param {Accessory[]} config.cached_accessories
     * @param {Logger} log
     * @param {AccessoryInfo} accessory_info
     * @param {IdentifierCache} identifier_cache
     * @param {Camera} camera_source
     */
    constructor(bridge, config, log, accessory_info, identifier_cache, camera_source) {
        this.bridge = bridge;
        this.config = config;
        this.log = log;

        this.accessories = bridge.bridgedAccessories;
        this.cached_accessories = config.cached_accessories || [];

        this.accessory_info = accessory_info;
        this.identifier_cache = identifier_cache;
        this.camera_source = camera_source;

        // Create our HAP server which handles all communication between iOS devices and us
        const server = this.server = new HAPServer(this.accessory_info /* , this.relay_server */);
        server.allowInsecureRequest = config.unauthenticated_access;

        const err = (message, callback) => err => {
            this.log.error(message, err);
            callback(err);
        };

        server.on('listening', port => this.handleServerListening(port));
        server.on('identify', callback =>
            this.handleIdentify().then(v => callback(null, v), err('Error in identify handler', callback)));
        server.on('pair', (username, public_key, callback) =>
            this.handlePair(username, public_key).then(v => callback(null, v), err('Error in pair handler', callback)));
        server.on('unpair', (username, callback) =>
            this.handleUnpair(username).then(v => callback(null, v), err('Error in unpair handler', callback)));
        server.on('accessories', callback =>
            this.handleAccessories().then(v => callback(null, v), err('Error in accessories handler', callback)));
        server.on('get-characteristics', (data, events, callback, remote, connection_id) =>
            this.handleGetCharacteristics(data, events, remote, connection_id)
                .then(v => callback(null, v), err('Error in get characteristics handler', callback)));
        server.on('set-characteristics', (data, events, callback, remote, connection_id) =>
            this.handleSetCharacteristics(data, events, remote, connection_id)
                .then(v => callback(null, v), err('Error in set characteristics handler', callback)));
        server.on('session-close', (session_id, events) => this.handleSessionClose(session_id, events));

        if (this.camera_source) {
            server.on('request-resource', (data, callback) =>
                this.handleResource(data)
                    .then(v => callback(null, v), err('Error in request resource handler', callback)));
        }

        // Create our Advertiser which broadcasts our presence over mdns
        this.advertiser = new Advertiser(this.accessory_info, this.mdns);
    }

    start() {
        this.server.listen(this.config.port);

        // The advertisement will be started when the server is started
    }

    stop() {
        this.server.stop();
        this.stopAdvertising();
    }

    /**
     * Gets an Accessory by it's ID.
     *
     * @param {number} aid
     * @param {boolean} [include_cached]
     * @return {Accessory}
     */
    getAccessoryByID(aid, include_cached) {
        if (aid === 1) return this.bridge;

        for (const accessory of this.accessories) {
            if (this.getAccessoryID(accessory) === aid) return accessory;
        }

        if (typeof include_cached === 'undefined' || include_cached) {
            for (const accessory of this.cached_accessories) {
                if (this.getAccessoryID(accessory) === aid) return accessory;
            }
        }
    }

    /**
     * Gets a Service by it's IID.
     *
     * @param {(Accessory|number)} aid
     * @param {number} iid
     * @return {Service}
     */
    getServiceByID(aid, iid) {
        const accessory = aid instanceof Accessory ? aid : this.getAccessoryByID(aid);
        if (!accessory) return null;

        for (const service of accessory.services) {
            if (this.getServiceID(accessory, service) === iid) return service;
        }
    }

    /**
     * Gets a Characteristic by it's IID.
     *
     * @param {(Accessory|number)} aid
     * @param {number} iid
     * @return {Characteristic}
     */
    getCharacteristicByID(aid, iid) {
        const accessory = aid instanceof Accessory ? aid : this.getAccessoryByID(aid);
        if (!accessory) return null;

        for (const service of accessory.services) {
            for (const characteristic of service.characteristics) {
                if (this.getCharacteristicID(accessory, service, characteristic) === iid) return characteristic;
            }
        }
    }

    /**
     * Get/assign an accessory ID.
     *
     * @param {Accessory} accessory
     * @return {number}
     */
    getAccessoryID(accessory) {
        if (accessory.UUID === this.bridge.UUID) return 1;

        return this.identifier_cache.getAID(accessory.UUID);
    }

    /**
     * Get/assign a service ID.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @return {number}
     */
    getServiceID(accessory, service) {
        // The Accessory Information service must have a (reserved by IdentifierCache) ID of 1
        if (service.UUID === '0000003E-0000-1000-8000-0026BB765291' && !service.subtype) return 1;

        return (accessory._isBridge ? 2000000000 : 0) +
            this.identifier_cache.getIID(accessory.UUID, service.UUID, service.subtype);
    }

    /**
     * Get/assign a characteristic ID.
     *
     * @param {Accessory} accessory
     * @param {Service} service
     * @param {Characteristic} characteristic
     * @return {number}
     */
    getCharacteristicID(accessory, service, characteristic) {
        return this.identifier_cache.getIID(accessory.UUID, service.UUID, service.subtype, characteristic.UUID);
    }

    get listening_port() {
        return this.server._httpServer._tcpServer.address().port;
    }

    startAdvertising() {
        this.advertiser.startAdvertising(this.listening_port);
    }

    updateAdvertisement() {
        this.advertiser.updateAdvertisement();
    }

    stopAdvertising() {
        this.advertiser.stopAdvertising();
    }

    /**
     * Called when the server starts listening.
     *
     * @param {number} port
     */
    handleServerListening(port) {
        this.startAdvertising();
    }

    /**
     * Handle /identify requests.
     *
     * @return {Promise}
     */
    async handleIdentify() {
        return new Promise((rs, rj) => {
            this.bridge.handleIdentify(err => err ? rj(err) : rs());
        });
    }

    /**
     * Handle /pair requests.
     *
     * @param {string} username
     * @param {string} public_key
     * @return {Promise}
     */
    async handlePair(username, public_key) {
        this.log.info('Pairing with client %s', username);

        this.accessory_info.addPairedClient(username, public_key);
        this.accessory_info.save();

        // Update our advertisement so it can pick up on the paired status of AccessoryInfo
        this.updateAdvertisement();
    }

    /**
     * Handle /unpair requests.
     *
     * @param {string} username
     * @return {Promise}
     */
    async handleUnpair(username) {
        this.log.info('Unpairing with client %s', username);

        this.accessory_info.removePairedClient(username);
        this.accessory_info.save();

        // Update our advertisement so it can pick up on the paired status of AccessoryInfo
        this.updateAdvertisement();
    }

    /**
     * Handle /accessories requests.
     * Called when an iOS client wishes to know all about our accessory via JSON payload.
     */
    async handleAccessories() {
        this.log.debug('Getting accessories');

        // Build out our JSON payload and call the callback
        const hap = {
            // Array of Accessory HAP
            // _handleGetCharacteristics will return SERVICE_COMMUNICATION_FAILURE for cached characteristics
            accessories: [this.bridge].concat(this.accessories, this.cached_accessories)
                .map(accessory => this.toHAP(accessory)),
        };

        // Save the identifier cache in case new identifiers were assigned
        this.identifier_cache.save();

        return hap;
    }

    /**
     * Get a HAP JSON representation of an Accessory.
     *
     * @param {Accessory} accessory
     * @param {object} [options]
     * @return {object}
     */
    toHAP(accessory, options) {
        return {
            aid: this.getAccessoryID(accessory),
            services: accessory.services.map(service => ({
                iid: this.getServiceID(accessory, service),
                type: service.UUID,
                characteristics: service.characteristics
                    .map(characteristic => Object.assign(characteristic.toHAP(options), {
                        iid: this.getCharacteristicID(accessory, service, characteristic),
                    })),

                primary: service.isPrimaryService,
                hidden: service.isHiddenService,

                linked: service.linkedServices.map(linked_service => this.getServiceID(accessory, linked_service)),
            })),
        };
    }

    /**
     * Handle /characteristics requests.
     * Called when an iOS client wishes to query the state of one or more characteristics, like "door open?", "light on?", etc.
     *
     * @param {object[]} data
     * @param {object} events
     * @param {object} remote
     * @param {string} connection_id
     * @return {Promise<object[]>}
     */
    async handleGetCharacteristics(data, events, remote, connection_id) {
        return Promise.all(data.map(data => this.handleGetCharacteristic(data, events, remote, connection_id)));
    }

    async handleGetCharacteristic(data, events, remote, connection_id) {
        const status_key = remote ? 's' : 'status';
        const value_key = remote ? 'v' : 'value';

        const {aid, iid, e: include_event} = data;
        const accessory = this.getAccessoryByID(aid, false);

        if (!accessory) {
            this.log.debug('Tried to get a characteristic from an unknown/cached accessory with aid', aid,
                'and iid', iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        const characteristic = this.getCharacteristicByID(accessory, iid);

        if (!characteristic) {
            this.log.warning('Could not find a characteristic with aid', aid, 'and iid', iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        // Found the Characteristic! Get the value!
        this.log.debug('Getting value for characteristic "%s"', characteristic.displayName);

        // We want to remember "who" made this request, so that we don't send them an event notification
        // about any changes that occurred as a result of the request. For instance, if after querying
        // the current value of a characteristic, the value turns out to be different than the previously
        // cached Characteristic value, an internal 'change' event will be emitted which will cause us to
        // notify all connected clients about that new value. But this client is about to get the new value
        // anyway, so we don't want to notify it twice.
        const context = events;

        try {
            const value = await new Promise((rs, rj) =>
                characteristic.getValue((err, value) => err ? rj(err) : rs(value), context, connection_id));

            // set the value and wait for success
            this.log.debug('Got characteristic "%s"', characteristic.displayName, value);

            // Compose the response and add it to the list
            return {
                aid, iid,
                [value_key]: value,
                [status_key]: 0,
                e: include_event ? events[`${aid}.${iid}`] === true : undefined,
            };
        } catch (err) {
            this.log.debug('Error getting value for characteristic "%s"', characteristic.displayName, err);

            return {
                aid, iid,
                [status_key]: hapStatus(err),
            };
        }
    }

    /**
     * Handle /characteristics requests.
     * Called when an iOS client wishes to change the state of this accessory - like opening a door, or turning on a light.
     * Or, to subscribe to change events for a particular Characteristic.
     *
     * @param {object[]} data
     * @param {object} events
     * @param {object} remote
     * @param {string} connection_id
     * @return {Promise<object[]>}
     */
    async handleSetCharacteristics(data, events, remote, connection_id) {
        // data is an array of characteristics and values like this:
        // [ { aid: 1, iid: 8, value: true, ev: true } ]

        this.log.debug('Processing characteristic set', JSON.stringify(data));

        return Promise.all(data.map(data => this.handleSetCharacteristic(data, events, remote, connection_id)));
    }

    async handleSetCharacteristic(data, events, remote, connection_id) {
        const value = remote ? data.v : data.value;
        const ev = remote ? data.e : data.ev;
        const include_value = data.r || false;

        const status_key = remote ? 's' : 'status';

        const {aid, iid} = data;
        const accessory = this.getAccessoryByID(aid, false);

        if (!accessory) {
            this.log.debug('Tried to get a characteristic from an unknown/cached accessory with aid', aid,
                'and iid', iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        const characteristic = this.getCharacteristicByID(accessory, iid);

        if (!characteristic) {
            this.log.warning('Could not find a characteristic with aid %d and iid %d', aid, iid);

            return {
                aid, iid,
                [status_key]: HAPServer.Status.SERVICE_COMMUNICATION_FAILURE,
            };
        }

        // We want to remember "who" initiated this change, so that we don't send them an event notification
        // about the change they just made. We do this by leveraging the arbitrary "context" object supported
        // by Characteristic and passed on to the corresponding 'change' events bubbled up from Characteristic
        // through Service and Accessory. We'll assign it to the events object since it essentially represents
        // the connection requesting the change.
        const context = events;

        // if "ev" is present, that means we need to register or unregister this client for change events for
        // this characteristic.
        if (typeof ev !== 'undefined') {
            this.log.debug(`${ev ? 'R' : 'Unr'}egistering characteristic "%s"`, characteristic.displayName);

            // Store event registrations in the supplied "events" dict which is associated with the connection making
            // the request.
            const event_name = aid + '.' + iid;

            if (ev === true && events[event_name] !== true) {
                events[event_name] = true; // value is arbitrary, just needs to be non-falsey
                characteristic.subscribe();
            }

            if (ev === false && events[event_name] !== undefined) {
                characteristic.unsubscribe();
                delete events[event_name]; // unsubscribe by deleting name from dict
            }
        }

        // Found the characteristic - set the value if there is one
        if (typeof value !== 'undefined') {
            this.log.debug('Setting characteristic "%s"', characteristic.displayName, value);

            try {
                // Set the value and wait for success
                await new Promise((rs, rj) =>
                    characteristic.setValue(value, (err, value) => err ? rj(err) : rs(value), context, connection_id));

                return {
                    aid, iid,
                    [status_key]: 0,
                    value: include_value ? characteristic.value : undefined,
                };
            } catch (err) {
                this.log.debug('Error setting characteristic "%s"', characteristic.displayName, value, err.message);

                return {
                    aid, iid,
                    [status_key]: hapStatus(err),
                };
            }
        }

        // no value to set, so we're done (success)
        return {
            aid, iid,
            [status_key]: 0,
        };
    }

    /**
     * Handles resource requests.
     *
     * @param {object} data
     * @return {Promise}
     */
    async handleResource(data) {
        if (data['resource-type'] === 'image' && this.camera_source) {
            return await new Promise((rs, rj) => this.camera_source.handleSnapshotRequest({
                width: data['image-width'],
                height: data['image-height'],
            }, (err, data) => err ? rj(err) : rs(data)));
        }

        throw new Error('resource not found');
    }

    /**
     * Handles session close.
     *
     * @param {string} session_id
     * @param {object} events
     * @return {Promise}
     */
    async handleSessionClose(session_id, events) {
        if (this.camera_source && this.camera_source.handleCloseConnection) {
            this.camera_source.handleCloseConnection(session_id);
        }

        // this._unsubscribeEvents(events);

        for (const key in events) {
            if (key.indexOf('.') === -1) continue;

            try {
                const [aid, iid] = key.split('.');

                const characteristic = this.getCharacteristicByID(aid, iid);
                if (characteristic) characteristic.unsubscribe();
            } catch (err) {}
        }
    }
}
