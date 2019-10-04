import './server/hap-async';

// @types/node-persist doesn't include types for persist.create
// This tells TypeScript about that function
import './types/node-persist';

import Events, {Event, ExtendableEvent, EventListeners} from './events';
import * as ServerEvents from './events/server';

import Server from './server/server';
import PluginManager from './server/plugins';
import Logger, {forceColour as forceColourLogs} from './common/logger';

import Automations from './automations';
import AutomationTrigger from './automations/trigger';
import AutomationCondition from './automations/condition';
import AutomationAction from './automations/action';

export {
    Events,
    Event,
    ServerEvents,
    ExtendableEvent,
    EventListeners,

    Server,
    PluginManager,
    Logger,
    forceColourLogs,

    Automations,
    AutomationTrigger,
    AutomationCondition,
    AutomationAction,
};

export const DEVELOPMENT = true;

export const package_json = DEVELOPMENT ? require('../package') : require('./package');
export const version: string = package_json.version;
export const package_path: string = DEVELOPMENT ? require('path').resolve(__dirname, '..') : __dirname;
export const path: string = __dirname;

export const events: Events = new Events();
