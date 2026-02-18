# @s3-tools/zip-transfer

Stream S3 folders to ZIP archives with presigned URLs. Combine multiple buckets and files into a single ZIP.

[![npm version](https://img.shields.io/npm/v/@s3-tools/zip-transfer)](https://www.npmjs.com/package/@s3-tools/zip-transfer)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **Streaming** - Low memory usage, handles files >2GB
- 📦 **Multi-Source** - Combine multiple buckets, prefixes, and single files
- 🔄 **Multipart Upload** - Supports files >5GB with 100MB parts
- 🔍 **Glob Filters** - Include/exclude with patterns per source
- 🔐 **Encryption** - Server-side encryption (AES256, KMS)
- 📊 **Progress Tracking** - Real-time progress with ETA and speed
- 🎯 **TypeScript** - Full type definitions
- ⚡ **Tree-shakeable** - ESM and CommonJS support

## Installation

```bash
npm install github:feegow/s3-zip-transfer @aws-sdk/client-s3
```

> Note: `@aws-sdk/client-s3` is a peer dependency

## Quick Start

```typescript
import { createS3ZipTransfer } from '@s3-tools/zip-transfer';

const transfer = createS3ZipTransfer({ region: 'us-east-1' });

const result = await transfer.zip({
  source: { bucket: 'my-bucket', prefix: 'data/' },
  destination: { bucket: 'backups', key: 'data.zip' },
});

console.log(result.presignedUrl);
```

## Multi-Source: Combine Buckets and Files

```typescript
const result = await transfer.zip({
  sources: [
    // Entire folder from bucket A
    { 
      bucket: 'bucket-production', 
      prefix: 'reports/2026/',
      destPrefix: 'reports/',  // folder inside ZIP
    },
    
    // Only images from bucket B
    { 
      bucket: 'bucket-media', 
      prefix: 'photos/',
      include: ['*.jpg', '*.png'],
      exclude: ['thumbnails/**'],
      destPrefix: 'images/',
    },
    
    // Single file from another bucket
    { 
      bucket: 'bucket-config', 
      key: 'settings/app.json',
    },
    
    // Another single file
    { 
      bucket: 'bucket-docs', 
      key: 'contracts/contract-2026.pdf',
    },
  ],
  
  destination: { 
    bucket: 'bucket-backup', 
    key: 'full-backup.zip' 
  },
});
```

**Generated ZIP structure:**
```
full-backup.zip
├── reports/
│   └── (files from bucket-production/reports/2026/)
├── images/
│   └── (jpg/png from bucket-media/photos/)
├── app.json
└── contract-2026.pdf
```

## Usage Examples

### Basic Usage

```typescript
import { zipS3Folder } from '@s3-tools/zip-transfer';

const result = await zipS3Folder({
  source: { bucket: 'source-bucket', prefix: 'folder/' },
  destination: { bucket: 'dest-bucket', key: 'archive.zip' },
  region: 'us-east-1',
});
```

### Large Files (>2GB)

```typescript
const result = await transfer.zip({
  source: { bucket: 'my-bucket', prefix: 'large-files/' },
  destination: { bucket: 'backups', key: 'large.zip' },
  options: {
    partSize: 100 * 1024 * 1024,  // 100MB parts (default)
    queueSize: 6,                  // parallel uploads
    compression: 0,                // no compression = faster
  },
});
```

### With Filters and Encryption

```typescript
const result = await transfer.zip({
  source: { bucket: 'my-bucket', prefix: 'docs/' },
  destination: { bucket: 'backups', key: 'docs.zip' },
  options: {
    include: ['*.pdf', '*.docx'],
    exclude: ['drafts/**', '*.tmp'],
    encryption: 'AES256',
    storageClass: 'STANDARD_IA',
    urlExpiration: 86400, // 24 hours
  },
});
```

### Progress Tracking

```typescript
const result = await transfer.zip({
  source: { bucket: 'my-bucket', prefix: 'data/' },
  destination: { bucket: 'backups', key: 'data.zip' },
  onProgress: (event) => {
    console.log(`Phase: ${event.phase}`);
    console.log(`Progress: ${event.percent}%`);
    console.log(`File: ${event.currentFile}`);
    console.log(`Speed: ${(event.speed! / 1024 / 1024).toFixed(2)} MB/s`);
    console.log(`ETA: ${Math.round(event.eta! / 1000)}s`);
  },
});
```

### Simple URL Function

```typescript
import { zipAndGetUrl } from '@s3-tools/zip-transfer';

const url = await zipAndGetUrl(
  'source-bucket',
  'folder/',
  'dest-bucket',
  'backup.zip'
);
```

### Custom Credentials

```typescript
const transfer = createS3ZipTransfer({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIA...',
    secretAccessKey: '...',
  },
});
```

### S3-Compatible Services (MinIO, etc.)

```typescript
const transfer = createS3ZipTransfer({
  endpoint: 'https://minio.example.com',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  },
});
```

### Cancellation

```typescript
const controller = new AbortController();

setTimeout(() => controller.abort(), 30000);

try {
  const result = await transfer.zip({
    source: { bucket: 'my-bucket', prefix: 'data/' },
    destination: { bucket: 'backups', key: 'data.zip' },
    signal: controller.signal,
  });
} catch (error) {
  if (error.code === 'OPERATION_CANCELLED') {
    console.log('Operation was cancelled');
  }
}
```

### Dry Run (Preview)

```typescript
const preview = await transfer.dryRun({
  sources: [
    { bucket: 'bucket-a', prefix: 'data/' },
    { bucket: 'bucket-b', key: 'file.pdf' },
  ],
  destination: { bucket: 'backups', key: 'data.zip' },
});

console.log(`Would include: ${preview.included.length} files`);
console.log(`Would exclude: ${preview.excluded.length} files`);
console.log(`Estimated size: ${preview.estimatedSize} bytes`);
```

## Use in API Services

```typescript
// services/backup.service.ts
import { createS3ZipTransfer, S3ZipError, ZipResult } from '@s3-tools/zip-transfer';

export class BackupService {
  private transfer = createS3ZipTransfer({
    region: process.env.AWS_REGION,
  });

  async createBackup(folders: { bucket: string; prefix: string }[]): Promise<ZipResult> {
    return this.transfer.zip({
      sources: folders.map(f => ({
        bucket: f.bucket,
        prefix: f.prefix,
        destPrefix: `${f.bucket}/`,
      })),
      destination: {
        bucket: process.env.BACKUP_BUCKET!,
        key: `backups/${Date.now()}.zip`,
      },
      options: {
        compression: 6,
        urlExpiration: 86400,
      },
    });
  }
}
```

## Error Handling

```typescript
import {
  zipS3Folder,
  BucketNotFoundError,
  AccessDeniedError,
  EmptySourceError,
  OperationCancelledError,
  isS3ZipError,
} from '@s3-tools/zip-transfer';

try {
  await transfer.zip({ ... });
} catch (error) {
  if (error instanceof BucketNotFoundError) {
    console.error('Bucket not found:', error.details?.bucket);
  } else if (error instanceof AccessDeniedError) {
    console.error('Access denied');
  } else if (error instanceof EmptySourceError) {
    console.error('No files found');
  } else if (error instanceof OperationCancelledError) {
    console.error('Cancelled by user');
  } else if (isS3ZipError(error)) {
    console.error('S3 Zip error:', error.code, error.message);
    if (error.retryable) {
      // Can retry this operation
    }
  }
}
```

## API Reference

### `createS3ZipTransfer(config?)`

Create a transfer instance.

```typescript
interface TransferConfig {
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  endpoint?: string;
  forcePathStyle?: boolean;
  logger?: Logger;
  defaults?: Partial<ZipOptions>;
}
```

### `transfer.zip(request)`

Zip S3 objects from one or more sources.

```typescript
interface ZipRequest {
  // Single source (simple)
  source?: { bucket: string; prefix?: string };
  
  // Multiple sources (advanced)
  sources?: SourceSpec[];
  
  destination: { bucket: string; key: string };
  options?: ZipOptions;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

interface SourceSpec {
  bucket: string;
  prefix?: string;           // folder (lists all objects)
  key?: string;              // single file
  include?: string[];        // glob patterns for this source
  exclude?: string[];        // glob patterns for this source
  destPrefix?: string;       // path prefix inside ZIP
}
```

### `ZipOptions`

```typescript
interface ZipOptions {
  compression?: number;        // 0-9 (default: 6)
  maxRetries?: number;         // default: 3
  partSize?: number;           // default: 100MB
  queueSize?: number;          // default: 4
  urlExpiration?: number;      // seconds (default: 3600)
  include?: string[];          // global glob patterns
  exclude?: string[];          // global glob patterns
  storageClass?: StorageClass;
  encryption?: 'AES256' | 'aws:kms';
  kmsKeyId?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  checksum?: boolean;
  flatten?: boolean;
  dryRun?: boolean;
}
```

### `ZipResult`

```typescript
interface ZipResult {
  bucket: string;
  key: string;
  size: number;
  presignedUrl: string;
  expiresAt: Date;
  objectCount: number;
  sourceSize: number;
  compressionRatio: number;
  duration: number;
  checksum?: string;
  errors: string[];
  skipped: string[];
  metrics: PerformanceMetrics;
}
```

## IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::source-bucket-*",
        "arn:aws:s3:::source-bucket-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::dest-bucket",
        "arn:aws:s3:::dest-bucket/*"
      ]
    }
  ]
}
```

## Performance Tips

| Scenario | Recommended Settings |
|----------|---------------------|
| Files >2GB | `compression: 0` (fastest) |
| Many small files | `compression: 6`, `queueSize: 8` |
| Slow network | `partSize: 50MB`, `queueSize: 2` |
| Fast network | `partSize: 100MB`, `queueSize: 8` |

## License

MIT
