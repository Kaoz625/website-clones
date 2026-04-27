export interface ImageMeta {
    width: number;
    height: number;
    channels: number;
}
export interface MatchResult {
    found: boolean;
    x: number;
    y: number;
    confidence: number;
}
export declare function getImageMeta(imagePath: string): Promise<ImageMeta>;
export declare function cropRegion(imagePath: string, x: number, y: number, width: number, height: number, outputPath: string): Promise<string>;
/**
 * Template matching using Sum of Absolute Differences (SAD).
 * Searches for templatePath within sourcePath.
 * Returns best-match coordinates and a confidence score (0–1, higher = better).
 */
export declare function templateMatch(sourcePath: string, templatePath: string): Promise<MatchResult>;
export declare function resizeImage(inputPath: string, outputPath: string, maxWidth: number): Promise<string>;
//# sourceMappingURL=vision.d.ts.map