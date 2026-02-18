import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  S3ServiceException,
  StorageClass,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable, PassThrough } from 'stream';
import { S3Object, Logger, StorageClass as StorageClassType } from '../types';
import { silentLogger } from '../utils/logger';
import { retryWithBackoff } from '../utils/format';
import {
  BucketNotFoundError,
  AccessDeniedError,
  UploadError,
} from '../errors';

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
  onProgress?: (uploaded: number) => void;
  abortSignal?: AbortSignal;
}

export class S3Service {
  private client: S3Client;
  private logger: Logger;
  private maxRetries: number;

  constructor(options: S3ServiceOptions = {}) {
    const {
      region = 'us-east-1',
      profile,
      maxRetries = 3,
      logger = silentLogger,
      credentials,
      s3Client,
      endpoint,
      forcePathStyle,
    } = options;

    // Use provided S3Client or create new one
    if (s3Client) {
      this.client = s3Client;
    } else {
      const clientConfig: any = {
        region,
        maxAttempts: maxRetries,
        retryMode: 'adaptive',
      };

      if (credentials) {
        clientConfig.credentials = credentials;
      } else if (profile) {
        clientConfig.credentials = fromIni({ profile });
      }

      if (endpoint) clientConfig.endpoint = endpoint;
      if (forcePathStyle) clientConfig.forcePathStyle = forcePathStyle;

      this.client = new S3Client(clientConfig);
    }

    this.logger = logger;
    this.maxRetries = maxRetries;
  }

  /**
   * Check if bucket exists and is accessible
   */
  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (error instanceof S3ServiceException) {
        if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
          return false;
        }
        if (error.name === 'Forbidden' || error.name === 'AccessDenied') {
          throw new AccessDeniedError(bucket, 'HeadBucket');
        }
      }
      throw error;
    }
  }

  /**
   * List all objects in a bucket/prefix
   */
  async listObjects(
    bucket: string,
    prefix: string,
    options: {
      onProgress?: (count: number) => void;
      abortSignal?: AbortSignal;
    } = {}
  ): Promise<S3Object[]> {
    const { onProgress, abortSignal } = options;
    const objects: S3Object[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        if (abortSignal?.aborted) {
          throw new Error('Operation aborted');
        }

        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          })
        );

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key && obj.Size !== undefined && obj.Size > 0) {
              objects.push({
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
                etag: obj.ETag,
                storageClass: obj.StorageClass,
              });
            }
          }
          onProgress?.(objects.length);
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);

      return objects;
    } catch (error) {
      this.handleError(error, bucket);
    }
  }

  /**
   * Get object as stream with retry
   */
  async getObjectStream(
    bucket: string,
    key: string,
    abortSignal?: AbortSignal
  ): Promise<Readable> {
    return retryWithBackoff(
      async () => {
        const response = await this.client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        );

        if (!response.Body) {
          throw new Error(`Empty body for object: ${key}`);
        }

        return response.Body as Readable;
      },
      {
        maxRetries: this.maxRetries,
        abortSignal,
        onRetry: (error, attempt) => {
          this.logger.warn(`Retry ${attempt}/${this.maxRetries} for ${key}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      }
    );
  }

  /**
   * Upload stream with multipart support (handles files >5GB)
   * Uses 100MB parts by default for optimal large file performance
   */
  async uploadStream(
    bucket: string,
    key: string,
    body: Readable | PassThrough,
    options: UploadStreamOptions = {}
  ): Promise<{ size: number; etag?: string }> {
    const {
      contentType = 'application/zip',
      partSize = 100 * 1024 * 1024, // 100MB default for large files
      queueSize = 4, // concurrent uploads
      storageClass = 'STANDARD',
      metadata,
      tagging,
      serverSideEncryption,
      sseKmsKeyId,
      onProgress,
      abortSignal,
    } = options;

    const taggingString = tagging
      ? Object.entries(tagging)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : undefined;

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        StorageClass: storageClass as StorageClass,
        ...(metadata && { Metadata: metadata }),
        ...(taggingString && { Tagging: taggingString }),
        ...(serverSideEncryption && { ServerSideEncryption: serverSideEncryption }),
        ...(sseKmsKeyId && { SSEKMSKeyId: sseKmsKeyId }),
      },
      queueSize, // concurrent part uploads
      partSize,  // size of each part
      leavePartsOnError: false,
    });

    let uploadedBytes = 0;
    let etag: string | undefined;

    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded) {
        uploadedBytes = progress.loaded;
        onProgress?.(uploadedBytes);
      }
    });

    try {
      const result = await upload.done();
      etag = result.ETag;
      return { size: uploadedBytes, etag };
    } catch (error) {
      if (abortSignal?.aborted) {
        throw new Error('Upload aborted');
      }
      throw new UploadError(
        error instanceof Error ? error.message : String(error),
        bucket,
        key
      );
    }
  }

  /**
   * Get object info (size, etag, etc)
   */
  async getObjectInfo(
    bucket: string,
    key: string
  ): Promise<{ size: number; etag?: string; contentType?: string }> {
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return {
      size: response.ContentLength || 0,
      etag: response.ETag,
      contentType: response.ContentType,
    };
  }

  /**
   * Generate presigned URL for download
   */
  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn }
    );
  }

  private handleError(error: unknown, context: string): never {
    if (error instanceof S3ServiceException) {
      if (error.name === 'NoSuchBucket') {
        throw new BucketNotFoundError(context);
      }
      if (error.name === 'AccessDenied' || error.name === 'Forbidden') {
        throw new AccessDeniedError(context);
      }
    }
    throw error;
  }
}
