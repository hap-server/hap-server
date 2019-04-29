import chalk from 'chalk';

export default class Logger {
    constructor(...prefix) {
        const logger = this;

        const loggerfunction = function() {
            // eslint-disable-next-line no-invalid-this, prefer-rest-params
            return logger.call(this, arguments);
        };

        loggerfunction.__proto__ = this.constructor.prototype;

        this.prefix = prefix;
        this.enable_timestamps = true;
        this.enable_debug = true;

        Object.defineProperty(loggerfunction, 'prefix', {get: () => this.prefix, set: v => this.prefix = v});
        Object.defineProperty(loggerfunction, 'enable_timestamps',
            {get: () => this.enable_timestamps, set: v => this.enable_timestamps = v});
        Object.defineProperty(loggerfunction, 'enable_debug',
            {get: () => this.enable_debug, set: v => this.enable_debug = v});

        return loggerfunction;
    }

    call(context, args) {
        this.log(...args);
    }

    write(level, ...args) {
        let func = console.log;
        let format = typeof args[0] === 'string' ? args.shift() : '';

        if (level === 'debug') {
            format = chalk.gray(format);
            args = args.map(arg => typeof arg === 'string' ? chalk.gray(arg) : arg);
        } else if (level === 'warning') {
            format = chalk.yellow(format);
            args = args.map(arg => typeof arg === 'string' ? chalk.yellow(arg) : arg);
            func = console.error;
        } else if (level === 'error') {
            format = chalk.red(format);
            args = args.map(arg => typeof arg === 'string' ? chalk.red(arg) : arg);
            func = console.error;
        }

        if (this.prefix.length) format = (chalk.cyan('[' + this.prefix.join(' ') + ']')) + ' ' + format;

        if (this.enable_timestamps && this.constructor.enable_timestamps) {
            format = chalk.white('[' + (new Date()).toLocaleString() + ']') + ' ' + format;
        }

        func.call(console, format, ...args);
    }

    debug(...args) {
        if (!this.enable_debug || !this.constructor.enable_debug) return;

        this.write('debug', ...args);
    }

    log(...args) {
        this.write('log', ...args);
    }

    info(...args) {
        this.write('info', ...args);
    }

    warn(...args) {
        this.write('warning', ...args);
    }

    error(...args) {
        this.write('error', ...args);
    }

    withPrefix(...prefix) {
        const logger = new this.constructor(this.prefix.concat(...prefix));

        logger.enable_timestamps = this.enable_timestamps;
        logger.enable_debug = this.enable_debug;

        return logger;
    }
}

Logger.enable_debug = false;
Logger.enable_timestamps = true;

export function forceColour() {
    chalk.enabled = true;
    chalk.level = 1;
}
