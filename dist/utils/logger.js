"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.silentLogger = exports.ConsoleLogger = void 0;
exports.createLogger = createLogger;
const levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};
/**
 * Simple console logger implementation
 */
class ConsoleLogger {
    minLevel;
    constructor(level = 'info') {
        this.minLevel = level;
    }
    shouldLog(level) {
        return levelPriority[level] >= levelPriority[this.minLevel];
    }
    debug(message, meta) {
        if (this.shouldLog('debug')) {
            console.debug(`[DEBUG] ${message}`, meta || '');
        }
    }
    info(message, meta) {
        if (this.shouldLog('info')) {
            console.info(`[INFO] ${message}`, meta || '');
        }
    }
    warn(message, meta) {
        if (this.shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, meta || '');
        }
    }
    error(message, meta) {
        if (this.shouldLog('error')) {
            console.error(`[ERROR] ${message}`, meta || '');
        }
    }
}
exports.ConsoleLogger = ConsoleLogger;
/**
 * Silent logger (no output)
 */
exports.silentLogger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};
/**
 * Create a logger with specified level
 */
function createLogger(level = 'info') {
    if (level === 'silent') {
        return exports.silentLogger;
    }
    return new ConsoleLogger(level);
}
//# sourceMappingURL=logger.js.map