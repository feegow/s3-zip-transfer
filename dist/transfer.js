"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3ZipTransfer = void 0;
exports.createS3ZipTransfer = createS3ZipTransfer;
const events_1 = require("events");
const types_1 = require("./types");
const s3_service_1 = require("./services/s3.service");
const zip_service_1 = require("./services/zip.service");
const logger_1 = require("./utils/logger");
const filter_1 = require("./utils/filter");
const format_1 = require("./utils/format");
const errors_1 = require("./errors");
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
class S3ZipTransfer extends events_1.EventEmitter {
    config;
    logger;
    s3Service;
    zipService;
    abortController;
    constructor(config = {}) {
        super();
        this.config = config;
        this.logger = config.logger || logger_1.silentLogger;
        this.s3Service = new s3_service_1.S3Service({
            region: config.region,
            profile: config.profile,
            credentials: config.credentials,
            s3Client: config.s3Client,
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle,
            logger: this.logger,
        });
        this.zipService = new zip_service_1.ZipService(this.s3Service, { logger: this.logger });
    }
    /**
     * Zip S3 objects and upload to destination
     */
    async zip(request) {
        // Validate request
        const validation = types_1.ZipRequestSchema.safeParse(request);
        if (!validation.success) {
            const errors = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            throw new errors_1.ValidationError(`Invalid request: ${errors.join('; ')}`);
        }
        // Merge options with defaults
        const options = {
            ...this.config.defaults,
            ...request.options,
        };
        const optionsValidation = types_1.ZipOptionsSchema.safeParse(options);
        if (!optionsValidation.success) {
            const errors = optionsValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            throw new errors_1.ValidationError(`Invalid options: ${errors.join('; ')}`);
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
        const metrics = {
            listingTime: 0,
            compressionTime: 0,
            uploadTime: 0,
            totalTime: 0,
            throughput: 0,
            objectsPerSecond: 0,
        };
        const emitProgress = (event) => {
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
                throw new errors_1.EmptySourceError('(multiple sources)', '');
            }
            // 2. Apply global filters (in addition to per-source filters already applied)
            this.checkCancelled(combinedSignal);
            emitProgress({ phase: 'filtering', percent: 0, processed: 0, total: allObjects.length });
            const { included: objects, excluded: skippedObjects } = (0, filter_1.filterObjects)(allObjects, {
                includePatterns: opts.include,
                excludePatterns: opts.exclude,
            });
            this.emit('filtering:complete', {
                included: objects.length,
                excluded: skippedObjects.length
            });
            if (objects.length === 0) {
                throw new errors_1.EmptySourceError('(sources)', '');
            }
            const sourceSize = objects.reduce((sum, obj) => sum + obj.size, 0);
            const skipped = skippedObjects.map(o => o.key);
            this.logger.info('Objects to process', {
                count: objects.length,
                totalSize: (0, format_1.formatBytes)(sourceSize),
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
            const { stream: zipStream, process: processZip } = this.zipService.createZipStreamMultiSource(objects, {
                compressionLevel: opts.compression,
                onProgress: (event) => emitProgress(event),
                abortSignal: combinedSignal,
                generateChecksum: opts.checksum,
                flattenPaths: opts.flatten,
            });
            // 5. Start upload in parallel
            this.emit('upload:start', { bucket: destination.bucket, key: destination.key });
            const uploadStart = Date.now();
            // Calculate object expiration date if specified
            const expiresDate = opts.objectExpiration
                ? new Date(Date.now() + opts.objectExpiration * 1000)
                : undefined;
            const uploadPromise = this.s3Service.uploadStream(destination.bucket, destination.key, zipStream, {
                partSize: opts.partSize,
                queueSize: opts.queueSize,
                storageClass: opts.storageClass,
                metadata: opts.metadata,
                tagging: opts.tags,
                serverSideEncryption: opts.encryption,
                sseKmsKeyId: opts.kmsKeyId,
                expires: expiresDate,
                abortSignal: combinedSignal,
                onProgress: (uploaded) => {
                    emitProgress({
                        phase: 'uploading',
                        percent: Math.min(99, Math.round((uploaded / sourceSize) * 100)),
                        processed: uploaded,
                        total: sourceSize,
                        bytesProcessed: uploaded,
                        totalBytes: sourceSize,
                        speed: (0, format_1.calculateSpeed)(uploaded, Date.now() - uploadStart),
                    });
                },
            });
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
            const { size: finalSize } = await this.s3Service.getObjectInfo(destination.bucket, destination.key);
            // 9. Generate presigned URL
            const presignedUrl = await this.s3Service.getPresignedUrl(destination.bucket, destination.key, opts.urlExpiration);
            const expiresAt = new Date(Date.now() + opts.urlExpiration * 1000);
            const duration = Date.now() - startTime;
            metrics.totalTime = duration;
            metrics.throughput = (0, format_1.calculateSpeed)(sourceSize, duration);
            metrics.objectsPerSecond = (objects.length / duration) * 1000;
            emitProgress({
                phase: 'done',
                percent: 100,
                processed: objects.length,
                total: objects.length
            });
            const result = {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    /**
     * Perform a dry run to see what would be processed
     */
    async dryRun(request) {
        const sources = this.normalizeSources(request);
        const allObjects = await this.collectObjectsFromSources(sources);
        const { included, excluded } = (0, filter_1.filterObjects)(allObjects, {
            includePatterns: request.options?.include,
            excludePatterns: request.options?.exclude,
        });
        const estimatedSize = included.reduce((sum, obj) => sum + obj.size, 0);
        return {
            included,
            excluded,
            estimatedSize,
            estimatedCompressedSize: (0, filter_1.estimateTotalCompressedSize)(included),
        };
    }
    /**
     * Cancel the current operation
     */
    cancel() {
        this.abortController?.abort();
    }
    /**
     * Normalize sources: convert legacy 'source' to 'sources' array
     */
    normalizeSources(request) {
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
    async collectObjectsFromSources(sources, abortSignal, emitProgress) {
        const allObjects = [];
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
                }
                catch (error) {
                    this.logger.warn(`Failed to get object info: ${source.bucket}/${source.key}`, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            else {
                // Prefix listing
                const objects = await this.s3Service.listObjects(source.bucket, source.prefix || '', {
                    onProgress: (count) => {
                        emitProgress?.({
                            phase: 'listing',
                            percent: 0,
                            processed: totalListed + count,
                            total: totalListed + count
                        });
                    },
                    abortSignal,
                });
                // Apply per-source filters
                const { included } = (0, filter_1.filterObjects)(objects, {
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
    getRelativePath(key, basePrefix) {
        const normalizedPrefix = basePrefix.replace(/^\/|\/$/g, '');
        if (!normalizedPrefix)
            return key;
        if (key.startsWith(normalizedPrefix + '/')) {
            return key.slice(normalizedPrefix.length + 1);
        }
        if (key.startsWith(normalizedPrefix)) {
            return key.slice(normalizedPrefix.length).replace(/^\//, '');
        }
        return key;
    }
    getFileName(key) {
        const parts = key.split('/');
        return parts[parts.length - 1] || key;
    }
    checkCancelled(signal) {
        if (signal?.aborted) {
            throw new errors_1.OperationCancelledError();
        }
    }
    combineSignals(...signals) {
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
exports.S3ZipTransfer = S3ZipTransfer;
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
function createS3ZipTransfer(config) {
    return new S3ZipTransfer(config);
}
//# sourceMappingURL=transfer.js.map