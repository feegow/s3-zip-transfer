"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zipS3Folder = zipS3Folder;
exports.zipAndGetUrl = zipAndGetUrl;
const transfer_1 = require("./transfer");
/**
 * Simple function to zip S3 folder and get presigned URL
 *
 * @example
 * ```typescript
 * const result = await zipS3Folder({
 *   source: { bucket: 'my-bucket', prefix: 'data/' },
 *   destination: { bucket: 'backups', key: 'data.zip' },
 *   region: 'us-east-1',
 * });
 *
 * console.log(result.presignedUrl);
 * ```
 */
async function zipS3Folder(params) {
    const transfer = (0, transfer_1.createS3ZipTransfer)({
        region: params.region,
        logger: params.logger,
    });
    return transfer.zip({
        source: params.source,
        destination: params.destination,
        options: params.options,
        onProgress: params.onProgress,
        signal: params.signal,
    });
}
/**
 * Simplified function that returns just the presigned URL
 *
 * @example
 * ```typescript
 * const url = await zipAndGetUrl(
 *   'source-bucket',
 *   'folder/',
 *   'dest-bucket',
 *   'backup.zip'
 * );
 * ```
 */
async function zipAndGetUrl(sourceBucket, sourcePrefix, destBucket, destKey, options) {
    const result = await zipS3Folder({
        source: { bucket: sourceBucket, prefix: sourcePrefix },
        destination: { bucket: destBucket, key: destKey },
        region: options?.region,
        options,
    });
    return result.presignedUrl;
}
//# sourceMappingURL=functions.js.map