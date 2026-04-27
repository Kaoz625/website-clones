export interface TextBlock {
    text: string;
    confidence: number;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export interface OcrResult {
    fullText: string;
    blocks: TextBlock[];
}
export declare function ocrImage(imagePath: string): Promise<OcrResult>;
export declare function ocrBuffer(imageBuffer: Buffer): Promise<OcrResult>;
export declare function terminateWorker(): Promise<void>;
export declare function inferElementType(block: TextBlock, imageWidth: number, imageHeight: number): string;
//# sourceMappingURL=ocr.d.ts.map