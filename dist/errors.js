"use strict";
/**
 * Custom error classes for S3 Zip Transfer
 * @module errors
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadError = exports.ValidationError = exports.OperationCancelledError = exports.EmptySourceError = exports.AccessDeniedError = exports.BucketNotFoundError = exports.S3ZipError = void 0;
exports.isS3ZipError = isS3ZipError;
/**
 * Base error class for all S3 Zip Transfer errors
 */
class S3ZipError extends Error {
    /** Error code for programmatic handling */
    code;
    /** Additional error details */
    details;
    /** Whether this error is retryable */
    retryable;
    constructor(message, code, options) {
        super(message);
        this.name = 'S3ZipError';
        this.code = code;
        this.details = options?.details;
        this.retryable = options?.retryable ?? false;
        Error.captureStackTrace?.(this, this.constructor);
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            retryable: this.retryable,
        };
    }
}
exports.S3ZipError = S3ZipError;
/**
 * Thrown when a specified S3 bucket does not exist
 */
class BucketNotFoundError extends S3ZipError {
    constructor(bucket) {
        super(`Bucket not found: ${bucket}`, 'BUCKET_NOT_FOUND', {
            details: { bucket },
            retryable: false,
        });
        this.name = 'BucketNotFoundError';
    }
}
exports.BucketNotFoundError = BucketNotFoundError;
/**
 * Thrown when access to an S3 resource is denied
 */
class AccessDeniedError extends S3ZipError {
    constructor(resource, operation) {
        super(`Access denied to resource: ${resource}`, 'ACCESS_DENIED', {
            details: { resource, operation },
            retryable: false,
        });
        this.name = 'AccessDeniedError';
    }
}
exports.AccessDeniedError = AccessDeniedError;
/**
 * Thrown when the source location contains no objects (or all were filtered out)
 */
class EmptySourceError extends S3ZipError {
    constructor(bucket, prefix) {
        super(`No objects found at s3://${bucket}/${prefix}`, 'EMPTY_SOURCE', { details: { bucket, prefix }, retryable: false });
        this.name = 'EmptySourceError';
    }
}
exports.EmptySourceError = EmptySourceError;
/**
 * Thrown when an operation is cancelled via AbortController
 */
class OperationCancelledError extends S3ZipError {
    constructor() {
        super('Operation cancelled by user', 'OPERATION_CANCELLED', {
            retryable: false,
        });
        this.name = 'OperationCancelledError';
    }
}
exports.OperationCancelledError = OperationCancelledError;
/**
 * Thrown when configuration validation fails
 */
class ValidationError extends S3ZipError {
    constructor(message, fields) {
        super(message, 'VALIDATION_ERROR', {
            details: { fields },
            retryable: false,
        });
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
/**
 * Thrown when an S3 upload operation fails
 */
class UploadError extends S3ZipError {
    constructor(message, bucket, key) {
        super(message, 'UPLOAD_ERROR', {
            details: { bucket, key },
            retryable: true,
        });
        this.name = 'UploadError';
    }
}
exports.UploadError = UploadError;
/**
 * Type guard to check if an error is an S3ZipError
 */
function isS3ZipError(error) {
    return error instanceof S3ZipError;
}
//# sourceMappingURL=errors.js.map