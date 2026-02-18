import { createS3ZipTransfer } from './transfer';
import { TransferConfig, ZipOptions, ZipResult, ProgressCallback, Logger } from './types';

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
export async function zipS3Folder(params: {
  source: { bucket: string; prefix?: string };
  destination: { bucket: string; key: string };
  region?: string;
  options?: ZipOptions;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  logger?: Logger;
}): Promise<ZipResult> {
  const transfer = createS3ZipTransfer({
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
export async function zipAndGetUrl(
  sourceBucket: string,
  sourcePrefix: string,
  destBucket: string,
  destKey: string,
  options?: ZipOptions & { region?: string }
): Promise<string> {
  const result = await zipS3Folder({
    source: { bucket: sourceBucket, prefix: sourcePrefix },
    destination: { bucket: destBucket, key: destKey },
    region: options?.region,
    options,
  });

  return result.presignedUrl;
}
