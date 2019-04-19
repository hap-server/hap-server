import Server from './core/server';
import * as HapAsync from './core/hap-async';
import PluginManager from './core/plugins';
import Logger, {forceColour as forceColourLogs} from './core/logger';

export {
    Server,
    HapAsync,
    PluginManager,
    Logger,
    forceColourLogs,
};

export const DEVELOPMENT = true;

export const package_json = (() => {
    if (DEVELOPMENT) {
        return require('../package');
    }

    return require('./package');
})();

export const version = package_json.version;
