import './server/hap-async';

import Events, {Event, ExtendableEvent, EventListeners} from './events';
import * as ServerEvents from './events/server';
import TypedEventEmitter from './events/typed-eventemitter';

import Server from './server/server';
import PluginManager from './server/plugins';
import {AccessoryEvents, AccessoryStatus} from './server/accessories';
import Logger, {forceColour as forceColourLogs} from './common/logger';

import Automations from './automations';
import AutomationTrigger from './automations/trigger';
import AutomationCondition from './automations/condition';
import AutomationAction from './automations/action';

import * as util from './util';

export {
    Events,
    Event,
    ServerEvents,
    ExtendableEvent,
    EventListeners,
    TypedEventEmitter,

    Server,
    PluginManager,
    Logger,
    forceColourLogs,

    AccessoryEvents,
    AccessoryStatus,

    Automations,
    AutomationTrigger,
    AutomationCondition,
    AutomationAction,

    util,
};

export const DEVELOPMENT = true;

export const package_json = DEVELOPMENT ? require('../package') : require('./package');
export const version: string = package_json.version;
export const package_path: string = DEVELOPMENT ? require('path').resolve(__dirname, '..') : __dirname;
export const path: string = __dirname;

export const events: Events = new Events();
