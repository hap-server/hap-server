import Events, {Event, ExtendableEvent, EventListeners} from './events';
import * as ServerEvents from './events/server';

import Server from './server/server';
import PluginManager from './server/plugins';
import Logger, {forceColour as forceColourLogs} from './common/logger';

import {AccessoryEvents} from './server/accessories';
import {AccessoryStatus} from './common/types/accessories';
import {
    DefinedRequestResponseMessages, DefinedRequestMessages, DefinedResponseMessages,
    RequestMessage, ResponseMessage,
} from './common/types/messages';
import * as BinaryMessageTypes from './common/types/binary-messages';
import * as BroadcastMessageTypes from './common/types/broadcast-messages';
import * as MessageTypes from './common/types/messages';
import * as HapTypes from './common/types/hap';

import Automations, {Automation, AutomationRunner} from './automations';
import AutomationTrigger from './automations/trigger';
import AutomationCondition from './automations/condition';
import AutomationAction from './automations/action';

import * as configuration from './cli/configuration';
import {getConfig, connect} from './cli';

const cliutil = {getConfig, connect};

import * as util from './util';

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

    AccessoryEvents,
    AccessoryStatus,
    DefinedRequestResponseMessages as RequestResponseMessages,
    DefinedRequestMessages as RequestMessages,
    DefinedResponseMessages as ResponseMessages,
    RequestMessage,
    ResponseMessage,
    BinaryMessageTypes,
    BroadcastMessageTypes,
    MessageTypes,
    HapTypes,

    Automations,
    Automation,
    AutomationRunner,
    AutomationTrigger,
    AutomationCondition,
    AutomationAction,

    configuration,
    cliutil,

    util,
};

export const DEVELOPMENT = true;

export const package_json = DEVELOPMENT ? require('../package') : require('./package');
export const version: string = package_json.version;
export const package_path: string = DEVELOPMENT ? require('path').resolve(__dirname, '..') : __dirname;
export const path: string = __dirname;

export const events: Events = new Events();
