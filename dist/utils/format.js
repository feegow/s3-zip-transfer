"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChecksumStream = void 0;
exports.formatBytes = formatBytes;
exports.formatDuration = formatDuration;
exports.calculateSpeed = calculateSpeed;
exports.calculateETA = calculateETA;
exports.calculateChecksum = calculateChecksum;
exports.sleep = sleep;
exports.retryWithBackoff = retryWithBackoff;
const crypto_1 = require("crypto");
const stream_1 = require("stream");
/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.round((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}
/**
 * Calculate speed in bytes per second
 */
function calculateSpeed(bytes, durationMs) {
    if (durationMs === 0)
        return 0;
    return Math.round((bytes / durationMs) * 1000);
}
/**
 * Calculate ETA based on current progress
 */
function calculateETA(startTime, processedBytes, totalBytes) {
    if (processedBytes === 0)
        return 0;
    const elapsed = Date.now() - startTime;
    const rate = processedBytes / elapsed;
    const remaining = totalBytes - processedBytes;
    return Math.round(remaining / rate);
}
/**
 * Transform stream that calculates MD5 checksum
 */
class ChecksumStream extends stream_1.Transform {
    hash = (0, crypto_1.createHash)('md5');
    _checksum = null;
    _transform(chunk, encoding, callback) {
        this.hash.update(chunk);
        this.push(chunk);
        callback();
    }
    _flush(callback) {
        this._checksum = this.hash.digest('hex');
        callback();
    }
    get checksum() {
        return this._checksum;
    }
}
exports.ChecksumStream = ChecksumStream;
/**
 * Calculate MD5 checksum of a buffer
 */
function calculateChecksum(data) {
    return (0, crypto_1.createHash)('md5').update(data).digest('hex');
}
/**
 * Sleep with AbortSignal support
 */
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Aborted'));
            return;
        }
        const timeoutId = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('Aborted'));
        });
    });
}
/**
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, options) {
    const { maxRetries, baseDelayMs = 100, maxDelayMs = 10000, onRetry, abortSignal } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (abortSignal?.aborted) {
                throw new Error('Operation aborted');
            }
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                onRetry?.(error, attempt);
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100, maxDelayMs);
                await sleep(delay, abortSignal);
            }
        }
    }
    throw lastError;
}
//# sourceMappingURL=format.js.map