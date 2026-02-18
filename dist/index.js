"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.silentLogger = exports.createLogger = exports.filterObjects = exports.formatDuration = exports.formatBytes = exports.isS3ZipError = exports.UploadError = exports.ValidationError = exports.OperationCancelledError = exports.EmptySourceError = exports.AccessDeniedError = exports.BucketNotFoundError = exports.S3ZipError = exports.zipAndGetUrl = exports.zipS3Folder = exports.S3ZipTransfer = exports.createS3ZipTransfer = void 0;
var transfer_1 = require("./transfer");
Object.defineProperty(exports, "createS3ZipTransfer", { enumerable: true, get: function () { return transfer_1.createS3ZipTransfer; } });
Object.defineProperty(exports, "S3ZipTransfer", { enumerable: true, get: function () { return transfer_1.S3ZipTransfer; } });
var functions_1 = require("./functions");
Object.defineProperty(exports, "zipS3Folder", { enumerable: true, get: function () { return functions_1.zipS3Folder; } });
Object.defineProperty(exports, "zipAndGetUrl", { enumerable: true, get: function () { return functions_1.zipAndGetUrl; } });
// Errors - named exports for tree-shaking
var errors_1 = require("./errors");
Object.defineProperty(exports, "S3ZipError", { enumerable: true, get: function () { return errors_1.S3ZipError; } });
Object.defineProperty(exports, "BucketNotFoundError", { enumerable: true, get: function () { return errors_1.BucketNotFoundError; } });
Object.defineProperty(exports, "AccessDeniedError", { enumerable: true, get: function () { return errors_1.AccessDeniedError; } });
Object.defineProperty(exports, "EmptySourceError", { enumerable: true, get: function () { return errors_1.EmptySourceError; } });
Object.defineProperty(exports, "OperationCancelledError", { enumerable: true, get: function () { return errors_1.OperationCancelledError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_1.ValidationError; } });
Object.defineProperty(exports, "UploadError", { enumerable: true, get: function () { return errors_1.UploadError; } });
Object.defineProperty(exports, "isS3ZipError", { enumerable: true, get: function () { return errors_1.isS3ZipError; } });
// Utilities (advanced usage)
var format_1 = require("./utils/format");
Object.defineProperty(exports, "formatBytes", { enumerable: true, get: function () { return format_1.formatBytes; } });
Object.defineProperty(exports, "formatDuration", { enumerable: true, get: function () { return format_1.formatDuration; } });
var filter_1 = require("./utils/filter");
Object.defineProperty(exports, "filterObjects", { enumerable: true, get: function () { return filter_1.filterObjects; } });
var logger_1 = require("./utils/logger");
Object.defineProperty(exports, "createLogger", { enumerable: true, get: function () { return logger_1.createLogger; } });
Object.defineProperty(exports, "silentLogger", { enumerable: true, get: function () { return logger_1.silentLogger; } });
//# sourceMappingURL=index.js.map