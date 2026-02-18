import { PassThrough } from 'stream';
import { S3Object, ProgressCallback, Logger } from '../types';
import { S3Service } from './s3.service';
import { ChecksumStream } from '../utils/format';
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
    process: () => Promise<{
        errors: string[];
        checksum?: string;
    }>;
}
export declare class ZipService {
    private s3Service;
    private logger;
    constructor(s3Service: S3Service, options?: ZipServiceOptions);
    /**
     * Create a ZIP stream from S3 objects (multi-source aware)
     * Objects must have sourceBucket and destPath set
     */
    createZipStreamMultiSource(objects: S3Object[], options?: CreateZipOptions): ZipStreamResult;
    /**
     * Create a ZIP stream from S3 objects (single bucket - legacy)
     * Optimized for large files (>2GB) with configurable buffers
     */
    createZipStream(bucket: string, objects: S3Object[], basePrefix: string, options?: CreateZipOptions): ZipStreamResult;
    private getRelativePath;
    private getFileName;
}
//# sourceMappingURL=zip.service.d.ts.map