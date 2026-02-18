import archiver from 'archiver';
import { PassThrough, Readable } from 'stream';
import { S3Object, ProgressCallback, ProgressEvent, Logger } from '../types';
import { S3Service } from './s3.service';
import { silentLogger } from '../utils/logger';
import { ChecksumStream, calculateETA, calculateSpeed } from '../utils/format';

export interface ZipServiceOptions {
  logger?: Logger;
}

export interface CreateZipOptions {
  compressionLevel?: number;
  onProgress?: ProgressCallback;
  abortSignal?: AbortSignal;
  generateChecksum?: boolean;
  flattenPaths?: boolean;
  /** High water mark for streams (default: 16MB for large files) */
  highWaterMark?: number;
}

export interface ZipStreamResult {
  stream: PassThrough;
  checksumStream?: ChecksumStream;
  process: () => Promise<{ errors: string[]; checksum?: string }>;
}

export class ZipService {
  private s3Service: S3Service;
  private logger: Logger;

  constructor(s3Service: S3Service, options: ZipServiceOptions = {}) {
    this.s3Service = s3Service;
    this.logger = options.logger || silentLogger;
  }

  /**
   * Create a ZIP stream from S3 objects (multi-source aware)
   * Objects must have sourceBucket and destPath set
   */
  createZipStreamMultiSource(
    objects: S3Object[],
    options: CreateZipOptions = {}
  ): ZipStreamResult {
    const {
      compressionLevel = 6,
      onProgress,
      abortSignal,
      generateChecksum = false,
      flattenPaths = false,
      highWaterMark = 16 * 1024 * 1024,
    } = options;

    const archive = archiver('zip', {
      zlib: { level: compressionLevel },
      highWaterMark,
      store: compressionLevel === 0,
    });

    const passThrough = new PassThrough({
      highWaterMark,
    });

    let checksumStream: ChecksumStream | undefined;
    if (generateChecksum) {
      checksumStream = new ChecksumStream();
      archive.pipe(checksumStream).pipe(passThrough);
    } else {
      archive.pipe(passThrough);
    }

    const errors: string[] = [];

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

    const process = async (): Promise<{ errors: string[]; checksum?: string }> => {
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
            const event: ProgressEvent = {
              phase: 'compressing',
              percent: Math.round((processed / total) * 100),
              processed,
              total,
              currentFile: `${bucket}/${obj.key}`,
              bytesProcessed,
              totalBytes,
              eta: calculateETA(startTime, bytesProcessed, totalBytes),
              speed: calculateSpeed(bytesProcessed, elapsed),
            };
            onProgress(event);
          }
        } catch (error) {
          if ((error as Error).message === 'Operation cancelled') {
            throw error;
          }

          const errorMsg = `Failed to process ${obj.sourceBucket}/${obj.key}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          this.logger.error('Error processing file', { key: obj.key, bucket: obj.sourceBucket });
          errors.push(errorMsg);
        }
      }

      await archive.finalize();

      if (checksumStream) {
        await new Promise<void>((resolve) => {
          checksumStream!.on('finish', resolve);
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
  createZipStream(
    bucket: string,
    objects: S3Object[],
    basePrefix: string,
    options: CreateZipOptions = {}
  ): ZipStreamResult {
    const {
      compressionLevel = 6,
      onProgress,
      abortSignal,
      generateChecksum = false,
      flattenPaths = false,
      highWaterMark = 16 * 1024 * 1024, // 16MB buffer for large files
    } = options;

    // Use store (no compression) for very large datasets to speed up
    const archive = archiver('zip', {
      zlib: { level: compressionLevel },
      highWaterMark,
      store: compressionLevel === 0, // Store mode when compression disabled
    });

    const passThrough = new PassThrough({
      highWaterMark, // Match archive buffer size
    });

    let checksumStream: ChecksumStream | undefined;
    if (generateChecksum) {
      checksumStream = new ChecksumStream();
      archive.pipe(checksumStream).pipe(passThrough);
    } else {
      archive.pipe(passThrough);
    }

    const errors: string[] = [];

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

    const process = async (): Promise<{ errors: string[]; checksum?: string }> => {
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
            const event: ProgressEvent = {
              phase: 'compressing',
              percent: Math.round((processed / total) * 100),
              processed,
              total,
              currentFile: obj.key,
              bytesProcessed,
              totalBytes,
              eta: calculateETA(startTime, bytesProcessed, totalBytes),
              speed: calculateSpeed(bytesProcessed, elapsed),
            };
            onProgress(event);
          }
        } catch (error) {
          if ((error as Error).message === 'Operation cancelled') {
            throw error;
          }

          const errorMsg = `Failed to process ${obj.key}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          this.logger.error('Error processing file', { key: obj.key });
          errors.push(errorMsg);
        }
      }

      await archive.finalize();

      if (checksumStream) {
        await new Promise<void>((resolve) => {
          checksumStream!.on('finish', resolve);
        });
      }

      return {
        errors,
        checksum: checksumStream?.checksum || undefined,
      };
    };

    return { stream: passThrough, checksumStream, process };
  }

  private getRelativePath(key: string, basePrefix: string): string {
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

  private getFileName(key: string): string {
    const parts = key.split('/');
    return parts[parts.length - 1] || key;
  }
}
