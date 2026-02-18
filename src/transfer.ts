import { EventEmitter } from 'events';
import {
  TransferConfig,
  ZipRequest,
  ZipResult,
  ZipOptions,
  DryRunResult,
  ZipRequestSchema,
  ZipOptionsSchema,
  SourceSpec,
  Logger,
  ProgressEvent,
  PerformanceMetrics,
  S3Object,
} from './types';
import { S3Service } from './services/s3.service';
import { ZipService } from './services/zip.service';
import { silentLogger } from './utils/logger';
import { filterObjects, estimateTotalCompressedSize } from './utils/filter';
import { formatBytes, formatDuration, calculateSpeed } from './utils/format';
import {
  S3ZipError,
  EmptySourceError,
  OperationCancelledError,
  ValidationError,
} from './errors';

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
export class S3ZipTransfer extends EventEmitter {
  private config: TransferConfig;
  private logger: Logger;
  private s3Service: S3Service;
  private zipService: ZipService;
  private abortController?: AbortController;

  constructor(config: TransferConfig = {}) {
    super();
    this.config = config;
    this.logger = config.logger || silentLogger;
    this.s3Service = new S3Service({
      region: config.region,
      profile: config.profile,
      credentials: config.credentials,
      s3Client: config.s3Client as any,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      logger: this.logger,
    });
    this.zipService = new ZipService(this.s3Service, { logger: this.logger });
  }

  /**
   * Zip S3 objects and upload to destination
   */
  async zip(request: ZipRequest): Promise<ZipResult> {
    // Validate request
    const validation = ZipRequestSchema.safeParse(request);
    if (!validation.success) {
      const errors = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new ValidationError(`Invalid request: ${errors.join('; ')}`);
    }

    // Merge options with defaults
    const options = {
      ...this.config.defaults,
      ...request.options,
    };

    const optionsValidation = ZipOptionsSchema.safeParse(options);
    if (!optionsValidation.success) {
      const errors = optionsValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new ValidationError(`Invalid options: ${errors.join('; ')}`);
    }

    const opts = optionsValidation.data;
    const { destination } = request;
    const onProgress = request.onProgress || request.options?.onProgress;
    const signal = request.signal || request.options?.signal;

    // Normalize sources: convert legacy 'source' to 'sources' array
    const sources = this.normalizeSources(request);

    // Create new abort controller for this operation
    this.abortController = new AbortController();
    const combinedSignal = signal 
      ? this.combineSignals(signal, this.abortController.signal)
      : this.abortController.signal;

    const startTime = Date.now();
    const metrics: PerformanceMetrics = {
      listingTime: 0,
      compressionTime: 0,
      uploadTime: 0,
      totalTime: 0,
      throughput: 0,
      objectsPerSecond: 0,
    };

    const emitProgress = (event: ProgressEvent) => {
      this.emit('progress', event);
      onProgress?.(event);
    };

    try {
      // Check cancellation
      this.checkCancelled(combinedSignal);

      // 1. List objects from all sources
      this.emit('listing:start', { sources: sources.length });
      const listingStart = Date.now();
      
      emitProgress({ phase: 'listing', percent: 0, processed: 0, total: 0 });

      const allObjects = await this.collectObjectsFromSources(sources, combinedSignal, emitProgress);

      metrics.listingTime = Date.now() - listingStart;
      this.emit('listing:complete', { objects: allObjects });

      if (allObjects.length === 0) {
        throw new EmptySourceError('(multiple sources)', '');
      }

      // 2. Apply global filters (in addition to per-source filters already applied)
      this.checkCancelled(combinedSignal);
      emitProgress({ phase: 'filtering', percent: 0, processed: 0, total: allObjects.length });

      const { included: objects, excluded: skippedObjects } = filterObjects(allObjects, {
        includePatterns: opts.include,
        excludePatterns: opts.exclude,
      });

      this.emit('filtering:complete', { 
        included: objects.length, 
        excluded: skippedObjects.length 
      });

      if (objects.length === 0) {
        throw new EmptySourceError('(sources)', '');
      }

      const sourceSize = objects.reduce((sum, obj) => sum + obj.size, 0);
      const skipped = skippedObjects.map(o => o.key);

      this.logger.info('Objects to process', {
        count: objects.length,
        totalSize: formatBytes(sourceSize),
        sources: sources.length,
      });

      // 3. Dry run - return estimates only
      if (opts.dryRun) {
        return {
          bucket: destination.bucket,
          key: destination.key,
          size: 0,
          presignedUrl: '',
          expiresAt: new Date(),
          objectCount: objects.length,
          sourceSize,
          compressionRatio: 0,
          duration: Date.now() - startTime,
          errors: [],
          skipped,
          metrics,
        };
      }

      // 4. Create ZIP stream (multi-source aware)
      this.checkCancelled(combinedSignal);
      this.emit('compression:start', { objectCount: objects.length, totalSize: sourceSize });

      const compressionStart = Date.now();
      const { stream: zipStream, process: processZip } = this.zipService.createZipStreamMultiSource(
        objects,
        {
          compressionLevel: opts.compression,
          onProgress: (event) => emitProgress(event),
          abortSignal: combinedSignal,
          generateChecksum: opts.checksum,
          flattenPaths: opts.flatten,
        }
      );

      // 5. Start upload in parallel
      this.emit('upload:start', { bucket: destination.bucket, key: destination.key });
      const uploadStart = Date.now();

      const uploadPromise = this.s3Service.uploadStream(
        destination.bucket,
        destination.key,
        zipStream,
        {
          partSize: opts.partSize,
          queueSize: opts.queueSize,
          storageClass: opts.storageClass,
          metadata: opts.metadata,
          tagging: opts.tags,
          serverSideEncryption: opts.encryption,
          sseKmsKeyId: opts.kmsKeyId,
          abortSignal: combinedSignal,
          onProgress: (uploaded) => {
            emitProgress({
              phase: 'uploading',
              percent: Math.min(99, Math.round((uploaded / sourceSize) * 100)),
              processed: uploaded,
              total: sourceSize,
              bytesProcessed: uploaded,
              totalBytes: sourceSize,
              speed: calculateSpeed(uploaded, Date.now() - uploadStart),
            });
          },
        }
      );

      // 6. Process files (feeds the stream)
      const { errors, checksum } = await processZip();
      metrics.compressionTime = Date.now() - compressionStart;

      // 7. Wait for upload
      this.checkCancelled(combinedSignal);
      await uploadPromise;
      metrics.uploadTime = Date.now() - uploadStart;

      this.emit('upload:complete', { 
        size: sourceSize, 
        durationMs: metrics.uploadTime 
      });

      // 8. Get final size
      emitProgress({ phase: 'finalizing', percent: 99, processed: 99, total: 100 });
      const { size: finalSize } = await this.s3Service.getObjectInfo(
        destination.bucket,
        destination.key
      );

      // 9. Generate presigned URL
      const presignedUrl = await this.s3Service.getPresignedUrl(
        destination.bucket,
        destination.key,
        opts.urlExpiration
      );

      const expiresAt = new Date(Date.now() + opts.urlExpiration * 1000);
      const duration = Date.now() - startTime;

      metrics.totalTime = duration;
      metrics.throughput = calculateSpeed(sourceSize, duration);
      metrics.objectsPerSecond = (objects.length / duration) * 1000;

      emitProgress({ 
        phase: 'done', 
        percent: 100, 
        processed: objects.length, 
        total: objects.length 
      });

      const result: ZipResult = {
        bucket: destination.bucket,
        key: destination.key,
        size: finalSize,
        presignedUrl,
        expiresAt,
        objectCount: objects.length,
        sourceSize,
        compressionRatio: finalSize > 0 ? sourceSize / finalSize : 0,
        duration,
        checksum,
        errors,
        skipped,
        metrics,
      };

      this.emit('complete', result);
      return result;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Perform a dry run to see what would be processed
   */
  async dryRun(request: Omit<ZipRequest, 'options'> & { options?: Partial<ZipOptions> }): Promise<DryRunResult> {
    const sources = this.normalizeSources(request as ZipRequest);
    const allObjects = await this.collectObjectsFromSources(sources);

    const { included, excluded } = filterObjects(allObjects, {
      includePatterns: request.options?.include,
      excludePatterns: request.options?.exclude,
    });

    const estimatedSize = included.reduce((sum, obj) => sum + obj.size, 0);

    return {
      included,
      excluded,
      estimatedSize,
      estimatedCompressedSize: estimateTotalCompressedSize(included),
    };
  }

  /**
   * Cancel the current operation
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Normalize sources: convert legacy 'source' to 'sources' array
   */
  private normalizeSources(request: ZipRequest): SourceSpec[] {
    if (request.sources && request.sources.length > 0) {
      return request.sources;
    }
    if (request.source) {
      return [{
        bucket: request.source.bucket,
        prefix: request.source.prefix,
      }];
    }
    return [];
  }

  /**
   * Collect objects from all sources
   */
  private async collectObjectsFromSources(
    sources: SourceSpec[],
    abortSignal?: AbortSignal,
    emitProgress?: (event: ProgressEvent) => void
  ): Promise<S3Object[]> {
    const allObjects: S3Object[] = [];
    let totalListed = 0;

    for (const source of sources) {
      this.checkCancelled(abortSignal);

      if (source.key) {
        // Single file
        try {
          const info = await this.s3Service.getObjectInfo(source.bucket, source.key);
          const destPath = source.destPrefix 
            ? `${source.destPrefix}${this.getFileName(source.key)}`
            : this.getFileName(source.key);
          
          allObjects.push({
            key: source.key,
            size: info.size,
            sourceBucket: source.bucket,
            destPath,
          });
          totalListed++;
        } catch (error) {
          this.logger.warn(`Failed to get object info: ${source.bucket}/${source.key}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        // Prefix listing
        const objects = await this.s3Service.listObjects(
          source.bucket,
          source.prefix || '',
          {
            onProgress: (count) => {
              emitProgress?.({ 
                phase: 'listing', 
                percent: 0, 
                processed: totalListed + count, 
                total: totalListed + count 
              });
            },
            abortSignal,
          }
        );

        // Apply per-source filters
        const { included } = filterObjects(objects, {
          includePatterns: source.include,
          excludePatterns: source.exclude,
        });

        // Add source metadata and compute destPath
        for (const obj of included) {
          const relativePath = this.getRelativePath(obj.key, source.prefix || '');
          const destPath = source.destPrefix 
            ? `${source.destPrefix}${relativePath}`
            : relativePath;

          allObjects.push({
            ...obj,
            sourceBucket: source.bucket,
            destPath,
          });
        }

        totalListed += objects.length;
      }
    }

    return allObjects;
  }

  private getRelativePath(key: string, basePrefix: string): string {
    const normalizedPrefix = basePrefix.replace(/^\/|\/$/g, '');
    if (!normalizedPrefix) return key;
    if (key.startsWith(normalizedPrefix + '/')) {
      return key.slice(normalizedPrefix.length + 1);
    }
    if (key.startsWith(normalizedPrefix)) {
      return key.slice(normalizedPrefix.length).replace(/^\//, '');
    }
    return key;
  }

  private getFileName(key: string): string {
    const parts = key.split('/');
    return parts[parts.length - 1] || key;
  }

  private checkCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new OperationCancelledError();
    }
  }

  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', () => controller.abort());
    }
    return controller.signal;
  }
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
export function createS3ZipTransfer(config?: TransferConfig): S3ZipTransfer {
  return new S3ZipTransfer(config);
}
