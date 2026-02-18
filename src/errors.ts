/**
 * Custom error classes for S3 Zip Transfer
 * @module errors
 */

/**
 * Base error class for all S3 Zip Transfer errors
 */
export class S3ZipError extends Error {
  /** Error code for programmatic handling */
  public readonly code: string;
  /** Additional error details */
  public readonly details?: Record<string, unknown>;
  /** Whether this error is retryable */
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { details?: Record<string, unknown>; retryable?: boolean }
  ) {
    super(message);
    this.name = 'S3ZipError';
    this.code = code;
    this.details = options?.details;
    this.retryable = options?.retryable ?? false;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

/**
 * Thrown when a specified S3 bucket does not exist
 */
export class BucketNotFoundError extends S3ZipError {
  constructor(bucket: string) {
    super(`Bucket not found: ${bucket}`, 'BUCKET_NOT_FOUND', {
      details: { bucket },
      retryable: false,
    });
    this.name = 'BucketNotFoundError';
  }
}

/**
 * Thrown when access to an S3 resource is denied
 */
export class AccessDeniedError extends S3ZipError {
  constructor(resource: string, operation?: string) {
    super(`Access denied to resource: ${resource}`, 'ACCESS_DENIED', {
      details: { resource, operation },
      retryable: false,
    });
    this.name = 'AccessDeniedError';
  }
}

/**
 * Thrown when the source location contains no objects (or all were filtered out)
 */
export class EmptySourceError extends S3ZipError {
  constructor(bucket: string, prefix: string) {
    super(
      `No objects found at s3://${bucket}/${prefix}`,
      'EMPTY_SOURCE',
      { details: { bucket, prefix }, retryable: false }
    );
    this.name = 'EmptySourceError';
  }
}

/**
 * Thrown when an operation is cancelled via AbortController
 */
export class OperationCancelledError extends S3ZipError {
  constructor() {
    super('Operation cancelled by user', 'OPERATION_CANCELLED', {
      retryable: false,
    });
    this.name = 'OperationCancelledError';
  }
}

/**
 * Thrown when configuration validation fails
 */
export class ValidationError extends S3ZipError {
  constructor(message: string, fields?: string[]) {
    super(message, 'VALIDATION_ERROR', {
      details: { fields },
      retryable: false,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when an S3 upload operation fails
 */
export class UploadError extends S3ZipError {
  constructor(message: string, bucket: string, key: string) {
    super(message, 'UPLOAD_ERROR', {
      details: { bucket, key },
      retryable: true,
    });
    this.name = 'UploadError';
  }
}

/**
 * Type guard to check if an error is an S3ZipError
 */
export function isS3ZipError(error: unknown): error is S3ZipError {
  return error instanceof S3ZipError;
}
