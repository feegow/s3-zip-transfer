import { S3Object } from '../types';
export interface FilterOptions {
    includePatterns?: string[];
    excludePatterns?: string[];
}
export interface FilterResult {
    included: S3Object[];
    excluded: S3Object[];
    matchStats: Record<string, number>;
}
/**
 * Filter S3 objects based on glob patterns
 */
export declare function filterObjects(objects: S3Object[], options: FilterOptions): FilterResult;
/**
 * Estimate compression ratio based on file extension
 */
export declare function estimateCompressionRatio(key: string): number;
/**
 * Estimate total compressed size
 */
export declare function estimateTotalCompressedSize(objects: S3Object[]): number;
//# sourceMappingURL=filter.d.ts.map