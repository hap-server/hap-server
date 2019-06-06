import Logger from './core/logger';

import Client from './common/client';
import Connection, {AuthenticatedUser} from './common/connection';
import Accessory from './common/accessory';
import Service from './common/service';
import CollapsedService from './common/collapsed-service';
import Characteristic from './common/characteristic';
import Layout from './common/layout';
import Scene from './common/scene';

export {
    Logger,

    Client,
    Connection,
    AuthenticatedUser,

    Accessory,
    Service,
    CollapsedService,
    Characteristic,

    Layout,
    Scene,
};

export const DEVELOPMENT = true;

export const package_json = DEVELOPMENT ? require('../package') : require('./package');
export const version = package_json.version;
export const package_path = DEVELOPMENT ? require('path').resolve(__dirname, '..') : __dirname;
export const path = __dirname;
