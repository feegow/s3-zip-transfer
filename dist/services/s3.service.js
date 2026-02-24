"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Service = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const lib_storage_1 = require("@aws-sdk/lib-storage");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const logger_1 = require("../utils/logger");
const format_1 = require("../utils/format");
const errors_1 = require("../errors");
class S3Service {
    client;
    logger;
    maxRetries;
    constructor(options = {}) {
        const { region = 'us-east-1', profile, maxRetries = 3, logger = logger_1.silentLogger, credentials, s3Client, endpoint, forcePathStyle, } = options;
        // Use provided S3Client or create new one
        if (s3Client) {
            this.client = s3Client;
        }
        else {
            const clientConfig = {
                region,
                maxAttempts: maxRetries,
                retryMode: 'adaptive',
            };
            if (credentials) {
                clientConfig.credentials = credentials;
            }
            else if (profile) {
                clientConfig.credentials = (0, credential_providers_1.fromIni)({ profile });
            }
            if (endpoint)
                clientConfig.endpoint = endpoint;
            if (forcePathStyle)
                clientConfig.forcePathStyle = forcePathStyle;
            this.client = new client_s3_1.S3Client(clientConfig);
        }
        this.logger = logger;
        this.maxRetries = maxRetries;
    }
    /**
     * Check if bucket exists and is accessible
     */
    async bucketExists(bucket) {
        try {
            await this.client.send(new client_s3_1.HeadBucketCommand({ Bucket: bucket }));
            return true;
        }
        catch (error) {
            if (error instanceof client_s3_1.S3ServiceException) {
                if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
                    return false;
                }
                if (error.name === 'Forbidden' || error.name === 'AccessDenied') {
                    throw new errors_1.AccessDeniedError(bucket, 'HeadBucket');
                }
            }
            throw error;
        }
    }
    /**
     * List all objects in a bucket/prefix
     */
    async listObjects(bucket, prefix, options = {}) {
        const { onProgress, abortSignal } = options;
        const objects = [];
        let continuationToken;
        try {
            do {
                if (abortSignal?.aborted) {
                    throw new Error('Operation aborted');
                }
                const response = await this.client.send(new client_s3_1.ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                    MaxKeys: 1000,
                }));
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
        }
        catch (error) {
            this.handleError(error, bucket);
        }
    }
    /**
     * Get object as stream with retry
     */
    async getObjectStream(bucket, key, abortSignal) {
        return (0, format_1.retryWithBackoff)(async () => {
            const response = await this.client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }));
            if (!response.Body) {
                throw new Error(`Empty body for object: ${key}`);
            }
            return response.Body;
        }, {
            maxRetries: this.maxRetries,
            abortSignal,
            onRetry: (error, attempt) => {
                this.logger.warn(`Retry ${attempt}/${this.maxRetries} for ${key}`, {
                    error: error instanceof Error ? error.message : String(error),
                });
            },
        });
    }
    /**
     * Upload stream with multipart support (handles files >5GB)
     * Uses 100MB parts by default for optimal large file performance
     */
    async uploadStream(bucket, key, body, options = {}) {
        const { contentType = 'application/zip', partSize = 100 * 1024 * 1024, // 100MB default for large files
        queueSize = 4, // concurrent uploads
        storageClass = 'STANDARD', metadata, tagging, serverSideEncryption, sseKmsKeyId, expires, onProgress, abortSignal, } = options;
        const taggingString = tagging
            ? Object.entries(tagging)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&')
            : undefined;
        const upload = new lib_storage_1.Upload({
            client: this.client,
            params: {
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                StorageClass: storageClass,
                ...(metadata && { Metadata: metadata }),
                ...(taggingString && { Tagging: taggingString }),
                ...(serverSideEncryption && { ServerSideEncryption: serverSideEncryption }),
                ...(sseKmsKeyId && { SSEKMSKeyId: sseKmsKeyId }),
                ...(expires && { Expires: expires }),
            },
            queueSize, // concurrent part uploads
            partSize, // size of each part
            leavePartsOnError: false,
        });
        let uploadedBytes = 0;
        let etag;
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
        }
        catch (error) {
            if (abortSignal?.aborted) {
                throw new Error('Upload aborted');
            }
            throw new errors_1.UploadError(error instanceof Error ? error.message : String(error), bucket, key);
        }
    }
    /**
     * Get object info (size, etag, etc)
     */
    async getObjectInfo(bucket, key) {
        const response = await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
            size: response.ContentLength || 0,
            etag: response.ETag,
            contentType: response.ContentType,
        };
    }
    /**
     * Generate presigned URL for download
     */
    async getPresignedUrl(bucket, key, expiresIn = 3600) {
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
    }
    handleError(error, context) {
        if (error instanceof client_s3_1.S3ServiceException) {
            if (error.name === 'NoSuchBucket') {
                throw new errors_1.BucketNotFoundError(context);
            }
            if (error.name === 'AccessDenied' || error.name === 'Forbidden') {
                throw new errors_1.AccessDeniedError(context);
            }
        }
        throw error;
    }
}
exports.S3Service = S3Service;
//# sourceMappingURL=s3.service.js.map