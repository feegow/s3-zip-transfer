"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZipRequestSchema = exports.SourceSpecSchema = exports.ZipOptionsSchema = void 0;
const zod_1 = require("zod");
// ============================================================================
// Internal Schemas (for validation)
// ============================================================================
/** @internal */
exports.ZipOptionsSchema = zod_1.z.object({
    compression: zod_1.z.number().min(0).max(9).default(6),
    maxRetries: zod_1.z.number().min(0).max(10).default(3),
    partSize: zod_1.z.number().min(5 * 1024 * 1024).default(100 * 1024 * 1024), // 100MB default for large files
    queueSize: zod_1.z.number().min(1).max(10).default(4),
    urlExpiration: zod_1.z.number().min(60).max(604800).default(3600),
    include: zod_1.z.array(zod_1.z.string()).optional(),
    exclude: zod_1.z.array(zod_1.z.string()).optional(),
    storageClass: zod_1.z.enum([
        'STANDARD', 'REDUCED_REDUNDANCY', 'STANDARD_IA', 'ONEZONE_IA',
        'INTELLIGENT_TIERING', 'GLACIER', 'DEEP_ARCHIVE', 'GLACIER_IR'
    ]).default('STANDARD'),
    encryption: zod_1.z.enum(['AES256', 'aws:kms']).optional(),
    kmsKeyId: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.string()).optional(),
    tags: zod_1.z.record(zod_1.z.string()).optional(),
    checksum: zod_1.z.boolean().default(false),
    flatten: zod_1.z.boolean().default(false),
    dryRun: zod_1.z.boolean().default(false),
});
/** @internal */
exports.SourceSpecSchema = zod_1.z.object({
    bucket: zod_1.z.string().min(3),
    prefix: zod_1.z.string().optional(),
    key: zod_1.z.string().optional(),
    include: zod_1.z.array(zod_1.z.string()).optional(),
    exclude: zod_1.z.array(zod_1.z.string()).optional(),
    destPrefix: zod_1.z.string().optional(),
});
/** @internal */
exports.ZipRequestSchema = zod_1.z.object({
    source: zod_1.z.object({
        bucket: zod_1.z.string().min(3),
        prefix: zod_1.z.string().default(''),
    }).optional(),
    sources: zod_1.z.array(exports.SourceSpecSchema).optional(),
    destination: zod_1.z.object({
        bucket: zod_1.z.string().min(3),
        key: zod_1.z.string().min(1),
    }),
    options: exports.ZipOptionsSchema.partial().optional(),
}).refine((data) => data.source || (data.sources && data.sources.length > 0), { message: 'Either source or sources must be provided' });
//# sourceMappingURL=types.js.map