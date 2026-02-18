"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterObjects = filterObjects;
exports.estimateCompressionRatio = estimateCompressionRatio;
exports.estimateTotalCompressedSize = estimateTotalCompressedSize;
const minimatch_1 = require("minimatch");
/**
 * Filter S3 objects based on glob patterns
 */
function filterObjects(objects, options) {
    const { includePatterns, excludePatterns } = options;
    const included = [];
    const excluded = [];
    const matchStats = {};
    for (const obj of objects) {
        let shouldInclude = true;
        // If include patterns exist, file must match at least one
        if (includePatterns && includePatterns.length > 0) {
            shouldInclude = includePatterns.some((pattern) => (0, minimatch_1.minimatch)(obj.key, pattern, { matchBase: true }));
        }
        // If exclude patterns exist, file must not match any
        if (shouldInclude && excludePatterns && excludePatterns.length > 0) {
            const isExcluded = excludePatterns.some((pattern) => (0, minimatch_1.minimatch)(obj.key, pattern, { matchBase: true }));
            if (isExcluded) {
                shouldInclude = false;
            }
        }
        if (shouldInclude) {
            included.push(obj);
        }
        else {
            excluded.push(obj);
        }
    }
    return { included, excluded, matchStats };
}
/**
 * Extensions that are already compressed (low compression gain)
 */
const ALREADY_COMPRESSED = new Set([
    '.zip', '.gz', '.bz2', '.xz', '.7z', '.rar',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif',
    '.mp3', '.mp4', '.m4a', '.m4v', '.mov', '.avi', '.mkv',
    '.pdf', '.docx', '.xlsx', '.pptx',
    '.woff', '.woff2',
]);
/**
 * Estimate compression ratio based on file extension
 */
function estimateCompressionRatio(key) {
    const ext = key.toLowerCase().slice(key.lastIndexOf('.'));
    if (ALREADY_COMPRESSED.has(ext)) {
        return 1.0; // No additional compression
    }
    // Text and code: high compression
    if (['.txt', '.log', '.json', '.xml', '.html', '.css', '.js', '.ts', '.md', '.csv'].includes(ext)) {
        return 0.3; // ~70% reduction
    }
    return 0.6; // ~40% reduction for generic files
}
/**
 * Estimate total compressed size
 */
function estimateTotalCompressedSize(objects) {
    return objects.reduce((total, obj) => {
        const ratio = estimateCompressionRatio(obj.key);
        return total + Math.round(obj.size * ratio);
    }, 0);
}
//# sourceMappingURL=filter.js.map