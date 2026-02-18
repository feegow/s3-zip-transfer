import { createHash } from 'crypto';
import { Transform, TransformCallback } from 'stream';

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
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
export function calculateSpeed(bytes: number, durationMs: number): number {
  if (durationMs === 0) return 0;
  return Math.round((bytes / durationMs) * 1000);
}

/**
 * Calculate ETA based on current progress
 */
export function calculateETA(
  startTime: number,
  processedBytes: number,
  totalBytes: number
): number {
  if (processedBytes === 0) return 0;
  const elapsed = Date.now() - startTime;
  const rate = processedBytes / elapsed;
  const remaining = totalBytes - processedBytes;
  return Math.round(remaining / rate);
}

/**
 * Transform stream that calculates MD5 checksum
 */
export class ChecksumStream extends Transform {
  private hash = createHash('md5');
  private _checksum: string | null = null;

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    this.hash.update(chunk);
    this.push(chunk);
    callback();
  }

  _flush(callback: TransformCallback): void {
    this._checksum = this.hash.digest('hex');
    callback();
  }

  get checksum(): string | null {
    return this._checksum;
  }
}

/**
 * Calculate MD5 checksum of a buffer
 */
export function calculateChecksum(data: Buffer): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * Sleep with AbortSignal support
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<T> {
  const { maxRetries, baseDelayMs = 100, maxDelayMs = 10000, onRetry, abortSignal } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        onRetry?.(error, attempt);

        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
          maxDelayMs
        );

        await sleep(delay, abortSignal);
      }
    }
  }

  throw lastError;
}
