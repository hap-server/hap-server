import Logger from './common/logger';

import Client from './client/client';
import Connection, {AuthenticatedUser} from './client/connection';
import Accessory from './client/accessory';
import Service from './client/service';
import CollapsedService from './client/collapsed-service';
import Characteristic from './client/characteristic';
import Layout from './client/layout';
import Automation from './client/automation';
import Scene from './client/scene';

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
    Automation,
    Scene,
};

export const DEVELOPMENT = true;

export const package_json = DEVELOPMENT ? require('../package') : require('./package');
export const version: string = package_json.version;
export const package_path: string = DEVELOPMENT ? require('path').resolve(__dirname, '..') : __dirname;
export const path: string = __dirname;