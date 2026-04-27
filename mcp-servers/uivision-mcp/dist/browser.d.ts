export interface ScreenshotOptions {
    fullPage?: boolean;
    width?: number;
    height?: number;
}
export declare function screenshotUrl(url: string, outputPath: string, opts?: ScreenshotOptions): Promise<string>;
export declare function screenshotFile(htmlPath: string, outputPath: string, opts?: ScreenshotOptions): Promise<string>;
export declare function closeBrowser(): Promise<void>;
//# sourceMappingURL=browser.d.ts.map