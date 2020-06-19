import {useEffect, useContext, useState, useRef} from 'react';
import Client from '../client';
import Accessory from '../accessory';
import Service from '../service';
import Characteristic from '../characteristic';

import {ClientContext} from '.';

export function useClient() {
    return useContext(ClientContext);
}

export function useAccessory(uuid: string, client?: Client, load?: boolean): Accessory | null
export function useAccessory(uuid: string, load?: boolean): Accessory | null
export function useAccessory(uuid: string, _client?: Client | boolean, load = false) {
    if (typeof _client === 'boolean') load = _client, _client = undefined;
    const client = _client || useClient();

    const [accessory, setAccessory] = useState(client?.accessories?.[uuid]);

    useEffect(() => {
        const update = () => {
            if (accessory !== client?.accessories?.[uuid]) {
                setAccessory(client?.accessories?.[uuid]);
            }
        };

        update();
        client?.on('updated-accessories', update);

        return () => {
            client?.removeListener('updated-accessories', update);
        };
    }, [client, uuid]);

    const dep = useRef();

    useEffect(() => {
        if (load) client?.loadAccessories(dep, [uuid]);

        return () => {
            if (load) client?.unloadAccessories(dep);
        };
    }, [client, uuid, load]);

    return accessory ?? null;
}

export function useAccessoryDetails(accessory: Accessory | null) {
    const [data, setData] = useState(accessory?.details);

    useEffect(() => {
        const update = () => {
            setData(accessory?.details);
        };

        update();
        accessory?.on('details-updated', update);

        return () => {
            accessory?.removeListener('details-updated', update);
        };
    }, [accessory]);

    return data;
}

export function useAccessoryData(accessory: Accessory | null) {
    const [data, setData] = useState(accessory?.data);

    useEffect(() => {
        const update = () => {
            setData(accessory?.data);
        };

        update();
        accessory?.on('data-updated', update);

        return () => {
            accessory?.removeListener('data-updated', update);
        };
    }, [accessory]);

    return data;
}

export function useServiceDetails(service: Service | null) {
    const [data, setData] = useState(service?.details);

    useEffect(() => {
        const update = () => {
            setData(service?.details);
        };

        update();
        service?.on('details-updated', update);

        return () => {
            service?.removeListener('details-updated', update);
        };
    }, [service]);

    return data;
}

export function useServiceData(service: Service | null) {
    const [data, setData] = useState(service?.data);

    useEffect(() => {
        const update = () => {
            setData(service?.data);
        };

        update();
        service?.on('data-updated', update);

        return () => {
            service?.removeListener('data-updated', update);
        };
    }, [service]);

    return data;
}

export function useCharacteristicDetails(characteristic: Characteristic | null) {
    const [data, setData] = useState(characteristic?.details);

    useEffect(() => {
        const update = () => {
            setData(characteristic?.details);
        };

        update();
        characteristic?.on('details-updated', update);

        return () => {
            characteristic?.removeListener('details-updated', update);
        };
    }, [characteristic]);

    return data;
}

export function useCharacteristicValue(characteristic: Characteristic | null, refresh = false) {
    const [data, setData] = useState(characteristic?.value);

    useEffect(() => {
        if (refresh) {
            characteristic?.updateValue();
        }

        const update = () => {
            setData(characteristic?.value);
        };

        update();
        characteristic?.on('value-updated', update);

        return () => {
            characteristic?.removeListener('value-updated', update);
        };
    }, [characteristic]);

    return data;
}

export function useCharacteristicSubscription(characteristic: Characteristic | null) {
    useEffect(function(this: any) {
        characteristic?.subscribe(this);

        return () => {
            characteristic?.unsubscribe(this);
        };
    }.bind({}), [characteristic]);
}
