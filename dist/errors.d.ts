/**
 * Custom error classes for S3 Zip Transfer
 * @module errors
 */
/**
 * Base error class for all S3 Zip Transfer errors
 */
export declare class S3ZipError extends Error {
    /** Error code for programmatic handling */
    readonly code: string;
    /** Additional error details */
    readonly details?: Record<string, unknown>;
    /** Whether this error is retryable */
    readonly retryable: boolean;
    constructor(message: string, code: string, options?: {
        details?: Record<string, unknown>;
        retryable?: boolean;
    });
    toJSON(): Record<string, unknown>;
}
/**
 * Thrown when a specified S3 bucket does not exist
 */
export declare class BucketNotFoundError extends S3ZipError {
    constructor(bucket: string);
}
/**
 * Thrown when access to an S3 resource is denied
 */
export declare class AccessDeniedError extends S3ZipError {
    constructor(resource: string, operation?: string);
}
/**
 * Thrown when the source location contains no objects (or all were filtered out)
 */
export declare class EmptySourceError extends S3ZipError {
    constructor(bucket: string, prefix: string);
}
/**
 * Thrown when an operation is cancelled via AbortController
 */
export declare class OperationCancelledError extends S3ZipError {
    constructor();
}
/**
 * Thrown when configuration validation fails
 */
export declare class ValidationError extends S3ZipError {
    constructor(message: string, fields?: string[]);
}
/**
 * Thrown when an S3 upload operation fails
 */
export declare class UploadError extends S3ZipError {
    constructor(message: string, bucket: string, key: string);
}
/**
 * Type guard to check if an error is an S3ZipError
 */
export declare function isS3ZipError(error: unknown): error is S3ZipError;
//# sourceMappingURL=errors.d.ts.map