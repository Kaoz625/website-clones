import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
export async function getImageMeta(imagePath) {
    const meta = await sharp(imagePath).metadata();
    return {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        channels: meta.channels ?? 3,
    };
}
export async function cropRegion(imagePath, x, y, width, height, outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    await sharp(imagePath)
        .extract({ left: x, top: y, width, height })
        .toFile(outputPath);
    return outputPath;
}
/**
 * Template matching using Sum of Absolute Differences (SAD).
 * Searches for templatePath within sourcePath.
 * Returns best-match coordinates and a confidence score (0–1, higher = better).
 */
export async function templateMatch(sourcePath, templatePath) {
    const [srcMeta, tplMeta] = await Promise.all([
        sharp(sourcePath).metadata(),
        sharp(templatePath).metadata(),
    ]);
    const srcW = srcMeta.width ?? 0;
    const srcH = srcMeta.height ?? 0;
    const tplW = tplMeta.width ?? 0;
    const tplH = tplMeta.height ?? 0;
    if (tplW > srcW || tplH > srcH) {
        return { found: false, x: 0, y: 0, confidence: 0 };
    }
    // Downsample for performance if source is large
    const scale = srcW > 1200 ? 1200 / srcW : 1;
    const scaledSrcW = Math.round(srcW * scale);
    const scaledSrcH = Math.round(srcH * scale);
    const scaledTplW = Math.round(tplW * scale);
    const scaledTplH = Math.round(tplH * scale);
    const [srcBuf, tplBuf] = await Promise.all([
        sharp(sourcePath).resize(scaledSrcW, scaledSrcH).removeAlpha().raw().toBuffer(),
        sharp(templatePath).resize(scaledTplW, scaledTplH).removeAlpha().raw().toBuffer(),
    ]);
    const channels = 3;
    let bestSAD = Infinity;
    let bestX = 0;
    let bestY = 0;
    const maxY = scaledSrcH - scaledTplH;
    const maxX = scaledSrcW - scaledTplW;
    // Step every 4px for speed, then refine around best match
    const step = 4;
    for (let sy = 0; sy <= maxY; sy += step) {
        for (let sx = 0; sx <= maxX; sx += step) {
            let sad = 0;
            for (let ty = 0; ty < scaledTplH; ty += 2) {
                for (let tx = 0; tx < scaledTplW; tx += 2) {
                    for (let c = 0; c < channels; c++) {
                        const srcIdx = ((sy + ty) * scaledSrcW + (sx + tx)) * channels + c;
                        const tplIdx = (ty * scaledTplW + tx) * channels + c;
                        sad += Math.abs(srcBuf[srcIdx] - tplBuf[tplIdx]);
                    }
                }
            }
            if (sad < bestSAD) {
                bestSAD = sad;
                bestX = sx;
                bestY = sy;
            }
        }
    }
    // Normalize: perfect match = 0 SAD = 1.0 confidence
    const maxPossibleSAD = scaledTplW * scaledTplH * channels * 255;
    const confidence = 1 - (bestSAD / maxPossibleSAD);
    return {
        found: confidence > 0.7,
        x: Math.round(bestX / scale),
        y: Math.round(bestY / scale),
        confidence: Math.round(confidence * 1000) / 1000,
    };
}
export async function resizeImage(inputPath, outputPath, maxWidth) {
    mkdirSync(dirname(outputPath), { recursive: true });
    await sharp(inputPath)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .toFile(outputPath);
    return outputPath;
}
//# sourceMappingURL=vision.js.map