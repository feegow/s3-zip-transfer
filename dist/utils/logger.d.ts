import { Logger, LogLevel } from '../types';
/**
 * Simple console logger implementation
 */
export declare class ConsoleLogger implements Logger {
    private minLevel;
    constructor(level?: LogLevel);
    private shouldLog;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
/**
 * Silent logger (no output)
 */
export declare const silentLogger: Logger;
/**
 * Create a logger with specified level
 */
export declare function createLogger(level?: LogLevel): Logger;
//# sourceMappingURL=logger.d.ts.map