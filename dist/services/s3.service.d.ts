import { S3Client } from '@aws-sdk/client-s3';
import { Readable, PassThrough } from 'stream';
import { S3Object, Logger, StorageClass as StorageClassType } from '../types';
export interface S3ServiceOptions {
    region?: string;
    profile?: string;
    maxRetries?: number;
    logger?: Logger;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    /** Pre-configured S3Client instance */
    s3Client?: S3Client;
    endpoint?: string;
    forcePathStyle?: boolean;
}
export interface UploadStreamOptions {
    contentType?: string;
    /** Part size for multipart upload (default: 100MB for large files) */
    partSize?: number;
    /** Concurrent upload parts (default: 4, max 10) */
    queueSize?: number;
    storageClass?: StorageClassType;
    metadata?: Record<string, string>;
    tagging?: Record<string, string>;
    serverSideEncryption?: 'AES256' | 'aws:kms';
    sseKmsKeyId?: string;
    /** HTTP Expires header - sets cache control metadata indicating when the object is considered stale */
    expires?: Date;
    onProgress?: (uploaded: number) => void;
    abortSignal?: AbortSignal;
}
export declare class S3Service {
    private client;
    private logger;
    private maxRetries;
    constructor(options?: S3ServiceOptions);
    /**
     * Check if bucket exists and is accessible
     */
    bucketExists(bucket: string): Promise<boolean>;
    /**
     * List all objects in a bucket/prefix
     */
    listObjects(bucket: string, prefix: string, options?: {
        onProgress?: (count: number) => void;
        abortSignal?: AbortSignal;
    }): Promise<S3Object[]>;
    /**
     * Get object as stream with retry
     */
    getObjectStream(bucket: string, key: string, abortSignal?: AbortSignal): Promise<Readable>;
    /**
     * Upload stream with multipart support (handles files >5GB)
     * Uses 100MB parts by default for optimal large file performance
     */
    uploadStream(bucket: string, key: string, body: Readable | PassThrough, options?: UploadStreamOptions): Promise<{
        size: number;
        etag?: string;
    }>;
    /**
     * Get object info (size, etag, etc)
     */
    getObjectInfo(bucket: string, key: string): Promise<{
        size: number;
        etag?: string;
        contentType?: string;
    }>;
    /**
     * Generate presigned URL for download
     */
    getPresignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
    private handleError;
}
//# sourceMappingURL=s3.service.d.ts.map