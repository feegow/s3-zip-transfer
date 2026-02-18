import { EventEmitter } from 'events';
import { TransferConfig, ZipRequest, ZipResult, ZipOptions, DryRunResult } from './types';
/**
 * Main transfer class with event support
 *
 * @example Single source
 * ```typescript
 * const transfer = createS3ZipTransfer({ region: 'us-east-1' });
 *
 * const result = await transfer.zip({
 *   source: { bucket: 'my-bucket', prefix: 'data/' },
 *   destination: { bucket: 'backups', key: 'data.zip' },
 * });
 * ```
 *
 * @example Multiple sources (mix buckets and files)
 * ```typescript
 * const result = await transfer.zip({
 *   sources: [
 *     { bucket: 'bucket-a', prefix: 'docs/', destPrefix: 'documentos/' },
 *     { bucket: 'bucket-b', prefix: 'images/', include: ['*.jpg', '*.png'] },
 *     { bucket: 'bucket-c', key: 'config/settings.json' }, // single file
 *   ],
 *   destination: { bucket: 'backups', key: 'combined.zip' },
 * });
 * ```
 */
export declare class S3ZipTransfer extends EventEmitter {
    private config;
    private logger;
    private s3Service;
    private zipService;
    private abortController?;
    constructor(config?: TransferConfig);
    /**
     * Zip S3 objects and upload to destination
     */
    zip(request: ZipRequest): Promise<ZipResult>;
    /**
     * Perform a dry run to see what would be processed
     */
    dryRun(request: Omit<ZipRequest, 'options'> & {
        options?: Partial<ZipOptions>;
    }): Promise<DryRunResult>;
    /**
     * Cancel the current operation
     */
    cancel(): void;
    /**
     * Normalize sources: convert legacy 'source' to 'sources' array
     */
    private normalizeSources;
    /**
     * Collect objects from all sources
     */
    private collectObjectsFromSources;
    private getRelativePath;
    private getFileName;
    private checkCancelled;
    private combineSignals;
}
/**
 * Factory function to create a transfer instance
 *
 * @example
 * ```typescript
 * const transfer = createS3ZipTransfer({
 *   region: 'us-east-1',
 *   defaults: { compression: 9 },
 * });
 * ```
 */
export declare function createS3ZipTransfer(config?: TransferConfig): S3ZipTransfer;
//# sourceMappingURL=transfer.d.ts.map