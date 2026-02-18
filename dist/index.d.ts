/**
 * @s3-tools/zip-transfer
 *
 * Stream S3 folders to ZIP archives with presigned URLs.
 *
 * @example Basic usage
 * ```typescript
 * import { createS3ZipTransfer } from '@s3-tools/zip-transfer';
 *
 * const transfer = createS3ZipTransfer({
 *   region: 'us-east-1',
 * });
 *
 * const result = await transfer.zip({
 *   source: { bucket: 'my-bucket', prefix: 'folder/' },
 *   destination: { bucket: 'backup-bucket', key: 'backup.zip' },
 * });
 *
 * console.log(result.presignedUrl);
 * ```
 *
 * @example With options
 * ```typescript
 * const result = await transfer.zip({
 *   source: { bucket: 'my-bucket', prefix: 'docs/' },
 *   destination: { bucket: 'backup-bucket', key: 'docs.zip' },
 *   options: {
 *     include: ['*.pdf', '*.docx'],
 *     exclude: ['drafts/**'],
 *     compression: 9,
 *     encryption: 'AES256',
 *   },
 *   onProgress: (event) => console.log(`${event.phase}: ${event.percent}%`),
 * });
 * ```
 *
 * @packageDocumentation
 */
export { createS3ZipTransfer, S3ZipTransfer } from './transfer';
export { zipS3Folder, zipAndGetUrl } from './functions';
export type { TransferConfig, TransferOptions, ZipOptions, ZipRequest, ZipResult, SourceSpec, ProgressEvent, ProgressPhase, ProgressCallback, S3Object, S3Location, PerformanceMetrics, Logger, LogLevel, } from './types';
export { S3ZipError, BucketNotFoundError, AccessDeniedError, EmptySourceError, OperationCancelledError, ValidationError, UploadError, isS3ZipError, } from './errors';
export { formatBytes, formatDuration } from './utils/format';
export { filterObjects } from './utils/filter';
export { createLogger, silentLogger } from './utils/logger';
//# sourceMappingURL=index.d.ts.map