import { z } from 'zod';
/**
 * S3 location (bucket + optional prefix/key)
 */
export interface S3Location {
    bucket: string;
    prefix?: string;
    key?: string;
}
/**
 * Single source specification
 */
export interface SourceSpec {
    /** Bucket name */
    bucket: string;
    /** Folder prefix (lists all objects under it) */
    prefix?: string;
    /** Specific file key (single file) */
    key?: string;
    /** Glob patterns to include */
    include?: string[];
    /** Glob patterns to exclude */
    exclude?: string[];
    /** Path prefix inside the ZIP (e.g., 'folder1/') */
    destPrefix?: string;
}
/**
 * S3 object metadata
 */
export interface S3Object {
    key: string;
    size: number;
    lastModified?: Date;
    etag?: string;
    storageClass?: string;
    /** Source bucket (for multi-source) */
    sourceBucket?: string;
    /** Destination path inside ZIP */
    destPath?: string;
}
/**
 * Storage classes available in S3
 */
export type StorageClass = 'STANDARD' | 'REDUCED_REDUNDANCY' | 'STANDARD_IA' | 'ONEZONE_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'DEEP_ARCHIVE' | 'GLACIER_IR';
/**
 * Server-side encryption types
 */
export type EncryptionType = 'AES256' | 'aws:kms';
/**
 * Configuration for creating a transfer instance
 */
export interface TransferConfig {
    /** AWS region */
    region?: string;
    /** AWS profile name (from ~/.aws/credentials) */
    profile?: string;
    /** Custom credentials (if not using environment/profile) */
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    /** Pre-configured S3Client instance (use this if you have custom auth) */
    s3Client?: unknown;
    /** Custom S3 endpoint (for S3-compatible services like MinIO) */
    endpoint?: string;
    /** Force path-style URLs (required for some S3-compatible services) */
    forcePathStyle?: boolean;
    /** Logger instance */
    logger?: Logger;
    /** Default options applied to all zip operations */
    defaults?: Partial<ZipOptions>;
}
/**
 * Options for zip operations
 */
export interface ZipOptions {
    /** Compression level (0-9, higher = smaller file, slower) */
    compression?: number;
    /** Maximum retry attempts for failed operations */
    maxRetries?: number;
    /** Part size for multipart upload in bytes (min 5MB, default: 100MB for large files) */
    partSize?: number;
    /** Concurrent upload parts (default: 4) */
    queueSize?: number;
    /** Presigned URL expiration in seconds (default: 3600) */
    urlExpiration?: number;
    /** HTTP Expires header in seconds - sets cache control metadata for the object */
    objectExpiration?: number;
    /** Glob patterns to include (e.g., ['*.jpg', 'docs/**']) */
    include?: string[];
    /** Glob patterns to exclude (e.g., ['*.tmp', 'node_modules/**']) */
    exclude?: string[];
    /** Storage class for the ZIP file */
    storageClass?: StorageClass;
    /** Server-side encryption */
    encryption?: EncryptionType;
    /** KMS key ID (required if encryption is 'aws:kms') */
    kmsKeyId?: string;
    /** Custom metadata for the ZIP file */
    metadata?: Record<string, string>;
    /** Tags for the ZIP file */
    tags?: Record<string, string>;
    /** Generate MD5 checksum */
    checksum?: boolean;
    /** Flatten directory structure (all files at root) */
    flatten?: boolean;
    /** Dry run - don't actually create the ZIP */
    dryRun?: boolean;
}
/**
 * Transfer options (extends ZipOptions with callbacks)
 */
export interface TransferOptions extends ZipOptions {
    /** Progress callback */
    onProgress?: ProgressCallback;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
}
/**
 * Request to zip S3 objects (supports single or multiple sources)
 */
export interface ZipRequest {
    /** Single source (legacy) */
    source?: {
        bucket: string;
        prefix?: string;
    };
    /** Multiple sources (new) - can mix buckets, prefixes, and specific files */
    sources?: SourceSpec[];
    /** Destination location */
    destination: {
        bucket: string;
        key: string;
    };
    /** Options for this operation */
    options?: TransferOptions;
    /** Progress callback (shorthand) */
    onProgress?: ProgressCallback;
    /** Abort signal (shorthand) */
    signal?: AbortSignal;
}
/**
 * Result of a zip operation
 */
export interface ZipResult {
    /** Destination bucket */
    bucket: string;
    /** Destination key */
    key: string;
    /** Size of the ZIP file in bytes */
    size: number;
    /** Presigned URL for download */
    presignedUrl: string;
    /** URL expiration time */
    expiresAt: Date;
    /** Number of objects included */
    objectCount: number;
    /** Total size of source objects */
    sourceSize: number;
    /** Compression ratio (sourceSize / size) */
    compressionRatio: number;
    /** Duration in milliseconds */
    duration: number;
    /** MD5 checksum (if requested) */
    checksum?: string;
    /** List of errors (non-fatal) */
    errors: string[];
    /** List of skipped files (filtered out) */
    skipped: string[];
    /** Performance metrics */
    metrics: PerformanceMetrics;
}
/**
 * Result of a dry run
 */
export interface DryRunResult {
    /** Objects that would be included */
    included: S3Object[];
    /** Objects that would be excluded */
    excluded: S3Object[];
    /** Estimated source size */
    estimatedSize: number;
    /** Estimated compressed size */
    estimatedCompressedSize: number;
}
/**
 * Performance metrics
 */
export interface PerformanceMetrics {
    /** Time spent listing objects (ms) */
    listingTime: number;
    /** Time spent compressing (ms) */
    compressionTime: number;
    /** Time spent uploading (ms) */
    uploadTime: number;
    /** Total time (ms) */
    totalTime: number;
    /** Throughput in bytes/second */
    throughput: number;
    /** Objects processed per second */
    objectsPerSecond: number;
}
/**
 * Progress phases
 */
export type ProgressPhase = 'listing' | 'filtering' | 'compressing' | 'uploading' | 'finalizing' | 'done';
/**
 * Progress event
 */
export interface ProgressEvent {
    /** Current phase */
    phase: ProgressPhase;
    /** Percentage complete (0-100) */
    percent: number;
    /** Items processed */
    processed: number;
    /** Total items */
    total: number;
    /** Current file being processed */
    currentFile?: string;
    /** Bytes processed */
    bytesProcessed?: number;
    /** Total bytes */
    totalBytes?: number;
    /** Estimated time remaining (ms) */
    eta?: number;
    /** Current speed (bytes/second) */
    speed?: number;
}
/**
 * Progress callback
 */
export type ProgressCallback = (event: ProgressEvent) => void;
/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
/**
 * Logger interface
 */
export interface Logger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
/** @internal */
export declare const ZipOptionsSchema: z.ZodObject<{
    compression: z.ZodDefault<z.ZodNumber>;
    maxRetries: z.ZodDefault<z.ZodNumber>;
    partSize: z.ZodDefault<z.ZodNumber>;
    queueSize: z.ZodDefault<z.ZodNumber>;
    urlExpiration: z.ZodDefault<z.ZodNumber>;
    objectExpiration: z.ZodOptional<z.ZodNumber>;
    include: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    exclude: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    storageClass: z.ZodDefault<z.ZodEnum<["STANDARD", "REDUCED_REDUNDANCY", "STANDARD_IA", "ONEZONE_IA", "INTELLIGENT_TIERING", "GLACIER", "DEEP_ARCHIVE", "GLACIER_IR"]>>;
    encryption: z.ZodOptional<z.ZodEnum<["AES256", "aws:kms"]>>;
    kmsKeyId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    tags: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    checksum: z.ZodDefault<z.ZodBoolean>;
    flatten: z.ZodDefault<z.ZodBoolean>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    compression: number;
    maxRetries: number;
    partSize: number;
    queueSize: number;
    urlExpiration: number;
    storageClass: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR";
    checksum: boolean;
    flatten: boolean;
    dryRun: boolean;
    objectExpiration?: number | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    encryption?: "AES256" | "aws:kms" | undefined;
    kmsKeyId?: string | undefined;
    metadata?: Record<string, string> | undefined;
    tags?: Record<string, string> | undefined;
}, {
    compression?: number | undefined;
    maxRetries?: number | undefined;
    partSize?: number | undefined;
    queueSize?: number | undefined;
    urlExpiration?: number | undefined;
    objectExpiration?: number | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
    encryption?: "AES256" | "aws:kms" | undefined;
    kmsKeyId?: string | undefined;
    metadata?: Record<string, string> | undefined;
    tags?: Record<string, string> | undefined;
    checksum?: boolean | undefined;
    flatten?: boolean | undefined;
    dryRun?: boolean | undefined;
}>;
/** @internal */
export declare const SourceSpecSchema: z.ZodObject<{
    bucket: z.ZodString;
    prefix: z.ZodOptional<z.ZodString>;
    key: z.ZodOptional<z.ZodString>;
    include: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    exclude: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    destPrefix: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    bucket: string;
    prefix?: string | undefined;
    key?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    destPrefix?: string | undefined;
}, {
    bucket: string;
    prefix?: string | undefined;
    key?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    destPrefix?: string | undefined;
}>;
/** @internal */
export declare const ZipRequestSchema: z.ZodEffects<z.ZodObject<{
    source: z.ZodOptional<z.ZodObject<{
        bucket: z.ZodString;
        prefix: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        bucket: string;
        prefix: string;
    }, {
        bucket: string;
        prefix?: string | undefined;
    }>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodObject<{
        bucket: z.ZodString;
        prefix: z.ZodOptional<z.ZodString>;
        key: z.ZodOptional<z.ZodString>;
        include: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exclude: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        destPrefix: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        bucket: string;
        prefix?: string | undefined;
        key?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        destPrefix?: string | undefined;
    }, {
        bucket: string;
        prefix?: string | undefined;
        key?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        destPrefix?: string | undefined;
    }>, "many">>;
    destination: z.ZodObject<{
        bucket: z.ZodString;
        key: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bucket: string;
        key: string;
    }, {
        bucket: string;
        key: string;
    }>;
    options: z.ZodOptional<z.ZodObject<{
        compression: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        maxRetries: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        partSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        queueSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        urlExpiration: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        objectExpiration: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        include: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
        exclude: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
        storageClass: z.ZodOptional<z.ZodDefault<z.ZodEnum<["STANDARD", "REDUCED_REDUNDANCY", "STANDARD_IA", "ONEZONE_IA", "INTELLIGENT_TIERING", "GLACIER", "DEEP_ARCHIVE", "GLACIER_IR"]>>>;
        encryption: z.ZodOptional<z.ZodOptional<z.ZodEnum<["AES256", "aws:kms"]>>>;
        kmsKeyId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        metadata: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
        tags: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
        checksum: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        flatten: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        dryRun: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        compression?: number | undefined;
        maxRetries?: number | undefined;
        partSize?: number | undefined;
        queueSize?: number | undefined;
        urlExpiration?: number | undefined;
        objectExpiration?: number | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
        encryption?: "AES256" | "aws:kms" | undefined;
        kmsKeyId?: string | undefined;
        metadata?: Record<string, string> | undefined;
        tags?: Record<string, string> | undefined;
        checksum?: boolean | undefined;
        flatten?: boolean | undefined;
        dryRun?: boolean | undefined;
    }, {
        compression?: number | undefined;
        maxRetries?: number | undefined;
        partSize?: number | undefined;
        queueSize?: number | undefined;
        urlExpiration?: number | undefined;
        objectExpiration?: number | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
        encryption?: "AES256" | "aws:kms" | undefined;
        kmsKeyId?: string | undefined;
        metadata?: Record<string, string> | undefined;
        tags?: Record<string, string> | undefined;
        checksum?: boolean | undefined;
        flatten?: boolean | undefined;
        dryRun?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    destination: {
        bucket: string;
        key: string;
    };
    options?: {
        compression?: number | undefined;
        maxRetries?: number | undefined;
        partSize?: number | undefined;
        queueSize?: number | undefined;
        urlExpiration?: number | undefined;
        objectExpiration?: number | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
        encryption?: "AES256" | "aws:kms" | undefined;
        kmsKeyId?: string | undefined;
        metadata?: Record<string, string> | undefined;
        tags?: Record<string, string> | undefined;
        checksum?: boolean | undefined;
        flatten?: boolean | undefined;
        dryRun?: boolean | undefined;
    } | undefined;
    source?: {
        bucket: string;
        prefix: string;
    } | undefined;
    sources?: {
        bucket: string;
        prefix?: string | undefined;
        key?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        destPrefix?: string | undefined;
    }[] | undefined;
}, {
    destination: {
        bucket: string;
        key: string;
    };
    options?: {
        compression?: number | undefined;
        maxRetries?: number | undefined;
        partSize?: number | undefined;
        queueSize?: number | undefined;
        urlExpiration?: number | undefined;
        objectExpiration?: number | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
        encryption?: "AES256" | "aws:kms" | undefined;
        kmsKeyId?: string | undefined;
        metadata?: Record<string, string> | undefined;
        tags?: Record<string, string> | undefined;
        checksum?: boolean | undefined;
        flatten?: boolean | undefined;
        dryRun?: boolean | undefined;
    } | undefined;
    source?: {
        bucket: string;
        prefix?: string | undefined;
    } | undefined;
    sources?: {
        bucket: string;
        prefix?: string | undefined;
        key?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        destPrefix?: string | undefined;
    }[] | undefined;
}>, {
    destination: {
        bucket: string;
        key: string;
    };
    options?: {
        compression?: number | undefined;
        maxRetries?: number | undefined;
        partSize?: number | undefined;
        queueSize?: number | undefined;
        urlExpiration?: number | undefined;
        objectExpiration?: number | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
        encryption?: "AES256" | "aws:kms" | undefined;
        kmsKeyId?: string | undefined;
        metadata?: Record<string, string> | undefined;
        tags?: Record<string, string> | undefined;
        checksum?: boolean | undefined;
        flatten?: boolean | undefined;
        dryRun?: boolean | undefined;
    } | undefined;
    source?: {
        bucket: string;
        prefix: string;
    } | undefined;
    sources?: {
        bucket: string;
        prefix?: string | undefined;
        key?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        destPrefix?: string | undefined;
    }[] | undefined;
}, {
    destination: {
        bucket: string;
        key: string;
    };
    options?: {
        compression?: number | undefined;
        maxRetries?: number | undefined;
        partSize?: number | undefined;
        queueSize?: number | undefined;
        urlExpiration?: number | undefined;
        objectExpiration?: number | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "INTELLIGENT_TIERING" | "GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR" | undefined;
        encryption?: "AES256" | "aws:kms" | undefined;
        kmsKeyId?: string | undefined;
        metadata?: Record<string, string> | undefined;
        tags?: Record<string, string> | undefined;
        checksum?: boolean | undefined;
        flatten?: boolean | undefined;
        dryRun?: boolean | undefined;
    } | undefined;
    source?: {
        bucket: string;
        prefix?: string | undefined;
    } | undefined;
    sources?: {
        bucket: string;
        prefix?: string | undefined;
        key?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        destPrefix?: string | undefined;
    }[] | undefined;
}>;
//# sourceMappingURL=types.d.ts.map