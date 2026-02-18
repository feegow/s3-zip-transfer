import { Logger, LogLevel } from '../types';

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Simple console logger implementation
 */
export class ConsoleLogger implements Logger {
  private minLevel: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] >= levelPriority[this.minLevel];
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, meta || '');
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, meta || '');
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, meta || '');
    }
  }
}

/**
 * Silent logger (no output)
 */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Create a logger with specified level
 */
export function createLogger(level: LogLevel = 'info'): Logger {
  if (level === 'silent') {
    return silentLogger;
  }
  return new ConsoleLogger(level);
}
