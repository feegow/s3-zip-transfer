import { Transform, TransformCallback } from 'stream';
/**
 * Format bytes to human-readable string
 */
export declare function formatBytes(bytes: number): string;
/**
 * Format duration in milliseconds to human-readable string
 */
export declare function formatDuration(ms: number): string;
/**
 * Calculate speed in bytes per second
 */
export declare function calculateSpeed(bytes: number, durationMs: number): number;
/**
 * Calculate ETA based on current progress
 */
export declare function calculateETA(startTime: number, processedBytes: number, totalBytes: number): number;
/**
 * Transform stream that calculates MD5 checksum
 */
export declare class ChecksumStream extends Transform {
    private hash;
    private _checksum;
    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    get checksum(): string | null;
}
/**
 * Calculate MD5 checksum of a buffer
 */
export declare function calculateChecksum(data: Buffer): string;
/**
 * Sleep with AbortSignal support
 */
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
/**
 * Retry with exponential backoff
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options: {
    maxRetries: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
    abortSignal?: AbortSignal;
}): Promise<T>;
//# sourceMappingURL=format.d.ts.map