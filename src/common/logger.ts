import chalk from 'chalk';

type LogLevel = 'debug' | 'log' | 'info' | 'warning' | 'error';

class Logger {
    static enable_debug = false;
    static enable_timestamps = true;

    prefix: string[];
    enable_timestamps = true;
    enable_debug = true;

    constructor(...prefix: string[]) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const logger = this;

        const loggerfunction = function Logger() {
            // eslint-disable-next-line no-invalid-this, prefer-rest-params
            return logger.call(this, arguments);
        } as Logger;

        (loggerfunction as any).__proto__ = this;

        this.prefix = prefix;

        return loggerfunction;
    }

    call(context, args) {
        this.log(...args);
    }

    write(level: LogLevel, ...args) {
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

    withPrefix(...prefix: string[]) {
        const logger = new this.constructor(...this.prefix.concat(...prefix)) as this;

        logger.enable_timestamps = this.enable_timestamps;
        logger.enable_debug = this.enable_debug;

        return logger;
    }

    /**
     * Wraps console.log/error to listen to output.
     *
     * @param {function} fn The original console.log/error function
     * @param {function} callback A function to call on log call
     * @return {function} The new console.log/error function
     */
    static wrapConsoleFn(fn: typeof console.log, callback: typeof console.log): typeof console.log {
        return (data, ...args) => {
            callback(data, ...args);
            return fn(data, ...args);
        };
    }
}

interface Logger {
    (...args: any[]): void;
    constructor: typeof Logger;
}

export default Logger;

export function forceColour() {
    chalk.enabled = true;
    chalk.level = 1;
}
