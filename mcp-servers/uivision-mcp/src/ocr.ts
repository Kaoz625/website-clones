import { createWorker } from 'tesseract.js';
import { readFileSync } from 'fs';

export interface TextBlock {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface OcrResult {
  fullText: string;
  blocks: TextBlock[];
}

let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
}

export async function ocrImage(imagePath: string): Promise<OcrResult> {
  const w = await getWorker();
  const { data } = await w.recognize(imagePath);

  const blocks: TextBlock[] = data.words
    .filter(word => word.text.trim().length > 0)
    .map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      },
    }));

  return { fullText: data.text, blocks };
}

export async function ocrBuffer(imageBuffer: Buffer): Promise<OcrResult> {
  const w = await getWorker();
  const { data } = await w.recognize(imageBuffer);

  const blocks: TextBlock[] = data.words
    .filter(word => word.text.trim().length > 0)
    .map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      },
    }));

  return { fullText: data.text, blocks };
}

export async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

export function inferElementType(block: TextBlock, imageWidth: number, imageHeight: number): string {
  const { text, bbox } = block;
  const relY = bbox.y / imageHeight;
  const relX = bbox.x / imageWidth;
  const width = bbox.width;
  const upper = text.toUpperCase();

  if (relY < 0.1) return 'nav';
  if (relY > 0.9) return 'footer';
  if (width > imageWidth * 0.5 && relY < 0.3) return 'heading';
  if (/^(submit|sign in|log in|login|register|buy|get started|learn more|contact|download|apply|join|subscribe)/i.test(text.trim())) return 'cta-button';
  if (/^(home|about|services|portfolio|work|blog|contact|projects|gallery)/i.test(text.trim())) return 'nav-link';
  if (text.length > 80) return 'body-text';
  if (width < 200 && text.length < 30) return 'label-or-button';
  return 'text';
}
