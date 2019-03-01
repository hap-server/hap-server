import chalk from 'chalk';

export default class Logger {
    constructor(...prefix) {
        const logger = function (...args) {
            return logger.call(this, args);
        };

        logger.__proto__ = this.constructor.prototype;

        logger.prefix = prefix;
        logger.enable_timestamps = true;
        logger.enable_debug = true;

        return logger;
    }

    call(context, args) {
        this.log(...args);
    }

    write(level, ...args) {
        let func = console.log;

        if (level === 'debug') {
            args = args.map(arg => typeof arg === 'string' ? chalk.gray(arg) : arg);
        } else if (level === 'warning') {
            args = args.map(arg => typeof arg === 'string' ? chalk.yellow(arg) : arg);
            func = console.error;
        } else if (level === 'error') {
            args = args.map(arg => typeof arg === 'string' ? chalk.red(arg) : arg);
            func = console.error;
        }

        if (this.prefix.length) args.unshift(chalk.cyan('[' + this.prefix.join(' ') + ']'));

        if (this.enable_timestamps && this.constructor.enable_timestamps) {
            args.unshift(chalk.white('[' + (new Date()).toLocaleString() + ']'));
        }

        func.apply(console, args);
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
