import { ZipOptions, ZipResult, ProgressCallback, Logger } from './types';
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
export declare function zipS3Folder(params: {
    source: {
        bucket: string;
        prefix?: string;
    };
    destination: {
        bucket: string;
        key: string;
    };
    region?: string;
    options?: ZipOptions;
    onProgress?: ProgressCallback;
    signal?: AbortSignal;
    logger?: Logger;
}): Promise<ZipResult>;
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
export declare function zipAndGetUrl(sourceBucket: string, sourcePrefix: string, destBucket: string, destKey: string, options?: ZipOptions & {
    region?: string;
}): Promise<string>;
//# sourceMappingURL=functions.d.ts.map