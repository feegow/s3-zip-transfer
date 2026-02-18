import { z } from 'zod';

// ============================================================================
// Core Types
// ============================================================================

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

// ============================================================================
// Configuration
// ============================================================================

/**
 * Storage classes available in S3
 */
export type StorageClass =
  | 'STANDARD'
  | 'REDUCED_REDUNDANCY'
  | 'STANDARD_IA'
  | 'ONEZONE_IA'
  | 'INTELLIGENT_TIERING'
  | 'GLACIER'
  | 'DEEP_ARCHIVE'
  | 'GLACIER_IR';

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
  
  // Filtering
  /** Glob patterns to include (e.g., ['*.jpg', 'docs/**']) */
  include?: string[];
  /** Glob patterns to exclude (e.g., ['*.tmp', 'node_modules/**']) */
  exclude?: string[];
  
  // S3 destination options
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
  
  // Behavior
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

// ============================================================================
// Results
// ============================================================================

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

// ============================================================================
// Progress
// ============================================================================

/**
 * Progress phases
 */
export type ProgressPhase =
  | 'listing'
  | 'filtering'
  | 'compressing'
  | 'uploading'
  | 'finalizing'
  | 'done';

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

// ============================================================================
// Logger
// ============================================================================

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

// ============================================================================
// Internal Schemas (for validation)
// ============================================================================

/** @internal */
export const ZipOptionsSchema = z.object({
  compression: z.number().min(0).max(9).default(6),
  maxRetries: z.number().min(0).max(10).default(3),
  partSize: z.number().min(5 * 1024 * 1024).default(100 * 1024 * 1024), // 100MB default for large files
  queueSize: z.number().min(1).max(10).default(4),
  urlExpiration: z.number().min(60).max(604800).default(3600),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  storageClass: z.enum([
    'STANDARD', 'REDUCED_REDUNDANCY', 'STANDARD_IA', 'ONEZONE_IA',
    'INTELLIGENT_TIERING', 'GLACIER', 'DEEP_ARCHIVE', 'GLACIER_IR'
  ]).default('STANDARD'),
  encryption: z.enum(['AES256', 'aws:kms']).optional(),
  kmsKeyId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  tags: z.record(z.string()).optional(),
  checksum: z.boolean().default(false),
  flatten: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

/** @internal */
export const SourceSpecSchema = z.object({
  bucket: z.string().min(3),
  prefix: z.string().optional(),
  key: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  destPrefix: z.string().optional(),
});

/** @internal */
export const ZipRequestSchema = z.object({
  source: z.object({
    bucket: z.string().min(3),
    prefix: z.string().default(''),
  }).optional(),
  sources: z.array(SourceSpecSchema).optional(),
  destination: z.object({
    bucket: z.string().min(3),
    key: z.string().min(1),
  }),
  options: ZipOptionsSchema.partial().optional(),
}).refine(
  (data) => data.source || (data.sources && data.sources.length > 0),
  { message: 'Either source or sources must be provided' }
);
