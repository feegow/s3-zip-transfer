"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZipService = void 0;
const archiver_1 = __importDefault(require("archiver"));
const stream_1 = require("stream");
const logger_1 = require("../utils/logger");
const format_1 = require("../utils/format");
class ZipService {
    s3Service;
    logger;
    constructor(s3Service, options = {}) {
        this.s3Service = s3Service;
        this.logger = options.logger || logger_1.silentLogger;
    }
    /**
     * Create a ZIP stream from S3 objects (multi-source aware)
     * Objects must have sourceBucket and destPath set
     */
    createZipStreamMultiSource(objects, options = {}) {
        const { compressionLevel = 6, onProgress, abortSignal, generateChecksum = false, flattenPaths = false, highWaterMark = 16 * 1024 * 1024, } = options;
        const archive = (0, archiver_1.default)('zip', {
            zlib: { level: compressionLevel },
            highWaterMark,
            store: compressionLevel === 0,
        });
        const passThrough = new stream_1.PassThrough({
            highWaterMark,
        });
        let checksumStream;
        if (generateChecksum) {
            checksumStream = new format_1.ChecksumStream();
            archive.pipe(checksumStream).pipe(passThrough);
        }
        else {
            archive.pipe(passThrough);
        }
        const errors = [];
        archive.on('error', (err) => {
            this.logger.error('Archive error', { error: err.message });
            errors.push(`Archive error: ${err.message}`);
            passThrough.destroy(err);
        });
        archive.on('warning', (err) => {
            if (err.code !== 'ENOENT') {
                this.logger.warn('Archive warning', { error: err.message });
            }
        });
        const process = async () => {
            const total = objects.length;
            let processed = 0;
            let bytesProcessed = 0;
            const totalBytes = objects.reduce((sum, obj) => sum + obj.size, 0);
            const startTime = Date.now();
            for (const obj of objects) {
                if (abortSignal?.aborted) {
                    archive.abort();
                    throw new Error('Operation cancelled');
                }
                try {
                    // Use sourceBucket from object (multi-source)
                    const bucket = obj.sourceBucket || '';
                    if (!bucket) {
                        throw new Error(`Missing sourceBucket for object: ${obj.key}`);
                    }
                    // Determine path inside ZIP
                    const zipPath = flattenPaths
                        ? this.getFileName(obj.key)
                        : (obj.destPath || obj.key);
                    const stream = await this.s3Service.getObjectStream(bucket, obj.key, abortSignal);
                    archive.append(stream, {
                        name: zipPath,
                        date: obj.lastModified,
                    });
                    processed++;
                    bytesProcessed += obj.size;
                    if (onProgress) {
                        const elapsed = Date.now() - startTime;
                        const event = {
                            phase: 'compressing',
                            percent: Math.round((processed / total) * 100),
                            processed,
                            total,
                            currentFile: `${bucket}/${obj.key}`,
                            bytesProcessed,
                            totalBytes,
                            eta: (0, format_1.calculateETA)(startTime, bytesProcessed, totalBytes),
                            speed: (0, format_1.calculateSpeed)(bytesProcessed, elapsed),
                        };
                        onProgress(event);
                    }
                }
                catch (error) {
                    if (error.message === 'Operation cancelled') {
                        throw error;
                    }
                    const errorMsg = `Failed to process ${obj.sourceBucket}/${obj.key}: ${error instanceof Error ? error.message : String(error)}`;
                    this.logger.error('Error processing file', { key: obj.key, bucket: obj.sourceBucket });
                    errors.push(errorMsg);
                }
            }
            await archive.finalize();
            if (checksumStream) {
                await new Promise((resolve) => {
                    checksumStream.on('finish', resolve);
                });
            }
            return {
                errors,
                checksum: checksumStream?.checksum || undefined,
            };
        };
        return { stream: passThrough, checksumStream, process };
    }
    /**
     * Create a ZIP stream from S3 objects (single bucket - legacy)
     * Optimized for large files (>2GB) with configurable buffers
     */
    createZipStream(bucket, objects, basePrefix, options = {}) {
        const { compressionLevel = 6, onProgress, abortSignal, generateChecksum = false, flattenPaths = false, highWaterMark = 16 * 1024 * 1024, // 16MB buffer for large files
         } = options;
        // Use store (no compression) for very large datasets to speed up
        const archive = (0, archiver_1.default)('zip', {
            zlib: { level: compressionLevel },
            highWaterMark,
            store: compressionLevel === 0, // Store mode when compression disabled
        });
        const passThrough = new stream_1.PassThrough({
            highWaterMark, // Match archive buffer size
        });
        let checksumStream;
        if (generateChecksum) {
            checksumStream = new format_1.ChecksumStream();
            archive.pipe(checksumStream).pipe(passThrough);
        }
        else {
            archive.pipe(passThrough);
        }
        const errors = [];
        archive.on('error', (err) => {
            this.logger.error('Archive error', { error: err.message });
            errors.push(`Archive error: ${err.message}`);
            passThrough.destroy(err);
        });
        archive.on('warning', (err) => {
            if (err.code !== 'ENOENT') {
                this.logger.warn('Archive warning', { error: err.message });
            }
        });
        const process = async () => {
            const total = objects.length;
            let processed = 0;
            let bytesProcessed = 0;
            const totalBytes = objects.reduce((sum, obj) => sum + obj.size, 0);
            const startTime = Date.now();
            for (const obj of objects) {
                if (abortSignal?.aborted) {
                    archive.abort();
                    throw new Error('Operation cancelled');
                }
                try {
                    const relativePath = flattenPaths
                        ? this.getFileName(obj.key)
                        : this.getRelativePath(obj.key, basePrefix);
                    const stream = await this.s3Service.getObjectStream(bucket, obj.key, abortSignal);
                    archive.append(stream, {
                        name: relativePath,
                        date: obj.lastModified,
                    });
                    processed++;
                    bytesProcessed += obj.size;
                    if (onProgress) {
                        const elapsed = Date.now() - startTime;
                        const event = {
                            phase: 'compressing',
                            percent: Math.round((processed / total) * 100),
                            processed,
                            total,
                            currentFile: obj.key,
                            bytesProcessed,
                            totalBytes,
                            eta: (0, format_1.calculateETA)(startTime, bytesProcessed, totalBytes),
                            speed: (0, format_1.calculateSpeed)(bytesProcessed, elapsed),
                        };
                        onProgress(event);
                    }
                }
                catch (error) {
                    if (error.message === 'Operation cancelled') {
                        throw error;
                    }
                    const errorMsg = `Failed to process ${obj.key}: ${error instanceof Error ? error.message : String(error)}`;
                    this.logger.error('Error processing file', { key: obj.key });
                    errors.push(errorMsg);
                }
            }
            await archive.finalize();
            if (checksumStream) {
                await new Promise((resolve) => {
                    checksumStream.on('finish', resolve);
                });
            }
            return {
                errors,
                checksum: checksumStream?.checksum || undefined,
            };
        };
        return { stream: passThrough, checksumStream, process };
    }
    getRelativePath(key, basePrefix) {
        const normalizedPrefix = basePrefix.replace(/^\/|\/$/g, '');
        if (!normalizedPrefix) {
            return key;
        }
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
}
exports.ZipService = ZipService;
//# sourceMappingURL=zip.service.js.map