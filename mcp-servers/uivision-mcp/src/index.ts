#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import { ocrImage, ocrBuffer, inferElementType } from './ocr.js';
import { getImageMeta, cropRegion, templateMatch } from './vision.js';
import { screenshotUrl, closeBrowser } from './browser.js';

const SHOTS_DIR = join(tmpdir(), 'uivision-mcp-shots');
mkdirSync(SHOTS_DIR, { recursive: true });

// Track the last screenshot path for region operations
let lastScreenshot: string | null = null;

const server = new Server(
  { name: 'uivision-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'take_screenshot',
      description: 'Captures a screenshot of a URL (full-page or viewport) and saves it locally. Returns the file path.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to screenshot' },
          fullPage: { type: 'boolean', description: 'Capture full scrollable page (default: false)' },
          width: { type: 'number', description: 'Viewport width in px (default: 1440)' },
          height: { type: 'number', description: 'Viewport height in px (default: 900)' },
          outputName: { type: 'string', description: 'Optional filename (e.g. "hero.png"). Defaults to timestamp.' },
        },
        required: ['url'],
      },
    },
    {
      name: 'ocr_screenshot',
      description: 'Takes a screenshot of a URL and runs OCR on it. Returns all recognized text with bounding box coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to screenshot and OCR' },
          fullPage: { type: 'boolean', description: 'Full-page screenshot (default: false)' },
        },
        required: ['url'],
      },
    },
    {
      name: 'ocr_region',
      description: 'Runs OCR on a rectangular region of the last screenshot. Use after take_screenshot or ocr_screenshot.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Left edge in px' },
          y: { type: 'number', description: 'Top edge in px' },
          width: { type: 'number', description: 'Region width in px' },
          height: { type: 'number', description: 'Region height in px' },
        },
        required: ['x', 'y', 'width', 'height'],
      },
    },
    {
      name: 'click_text',
      description: 'Finds a text string on screen via OCR and returns the center coordinates to click. Use take_screenshot first.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to find (case-insensitive, partial match OK)' },
          screenshotPath: { type: 'string', description: 'Path to screenshot (uses last screenshot if omitted)' },
        },
        required: ['text'],
      },
    },
    {
      name: 'image_search',
      description: 'Searches for a template image within a larger screenshot using pixel matching. Returns match location and confidence (0–1).',
      inputSchema: {
        type: 'object',
        properties: {
          templatePath: { type: 'string', description: 'Absolute path to the template image to find' },
          sourcePath: { type: 'string', description: 'Absolute path to the source image to search in (uses last screenshot if omitted)' },
        },
        required: ['templatePath'],
      },
    },
    {
      name: 'visual_assert',
      description: 'Checks that a text string is present anywhere on screen via OCR. Returns pass/fail with the matched text if found.',
      inputSchema: {
        type: 'object',
        properties: {
          expectedText: { type: 'string', description: 'Text that must appear on screen (case-insensitive)' },
          url: { type: 'string', description: 'URL to screenshot fresh (uses last screenshot if omitted)' },
        },
        required: ['expectedText'],
      },
    },
    {
      name: 'describe_layout',
      description: 'Takes a screenshot and returns a structured map of all detected text blocks with their positions, inferred element types, and a color palette extracted from the page.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to analyze' },
          fullPage: { type: 'boolean', description: 'Full-page capture (default: false)' },
        },
        required: ['url'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      case 'take_screenshot': {
        const { url, fullPage, width, height, outputName } = args as {
          url: string; fullPage?: boolean; width?: number; height?: number; outputName?: string;
        };
        const fname = outputName ?? `shot-${Date.now()}.png`;
        const outputPath = join(SHOTS_DIR, fname);
        await screenshotUrl(url, outputPath, { fullPage, width, height });
        lastScreenshot = outputPath;
        return { content: [{ type: 'text', text: JSON.stringify({ path: outputPath, url }) }] };
      }

      case 'ocr_screenshot': {
        const { url, fullPage } = args as { url: string; fullPage?: boolean };
        const outputPath = join(SHOTS_DIR, `ocr-${Date.now()}.png`);
        await screenshotUrl(url, outputPath, { fullPage });
        lastScreenshot = outputPath;
        const result = await ocrImage(outputPath);
        return { content: [{ type: 'text', text: JSON.stringify({ screenshotPath: outputPath, ...result }) }] };
      }

      case 'ocr_region': {
        const { x, y, width, height } = args as { x: number; y: number; width: number; height: number };
        if (!lastScreenshot || !existsSync(lastScreenshot)) {
          throw new Error('No screenshot available. Run take_screenshot or ocr_screenshot first.');
        }
        const cropPath = join(SHOTS_DIR, `region-${Date.now()}.png`);
        await cropRegion(lastScreenshot, x, y, width, height, cropPath);
        const result = await ocrImage(cropPath);
        return { content: [{ type: 'text', text: JSON.stringify({ region: { x, y, width, height }, ...result }) }] };
      }

      case 'click_text': {
        const { text, screenshotPath } = args as { text: string; screenshotPath?: string };
        const shotPath = screenshotPath ?? lastScreenshot;
        if (!shotPath || !existsSync(shotPath)) {
          throw new Error('No screenshot available. Run take_screenshot first.');
        }
        const result = await ocrImage(shotPath);
        const needle = text.toLowerCase();
        const match = result.blocks.find(b => b.text.toLowerCase().includes(needle));
        if (!match) {
          return { content: [{ type: 'text', text: JSON.stringify({ found: false, text, message: 'Text not found on screen' }) }] };
        }
        const cx = match.bbox.x + Math.round(match.bbox.width / 2);
        const cy = match.bbox.y + Math.round(match.bbox.height / 2);
        return { content: [{ type: 'text', text: JSON.stringify({ found: true, text: match.text, x: cx, y: cy, bbox: match.bbox, confidence: match.confidence }) }] };
      }

      case 'image_search': {
        const { templatePath, sourcePath } = args as { templatePath: string; sourcePath?: string };
        const source = sourcePath ?? lastScreenshot;
        if (!source || !existsSync(source)) {
          throw new Error('No source screenshot available. Run take_screenshot first or pass sourcePath.');
        }
        if (!existsSync(templatePath)) {
          throw new Error(`Template image not found: ${templatePath}`);
        }
        const match = await templateMatch(source, templatePath);
        return { content: [{ type: 'text', text: JSON.stringify(match) }] };
      }

      case 'visual_assert': {
        const { expectedText, url } = args as { expectedText: string; url?: string };
        let shotPath = lastScreenshot;
        if (url) {
          const outputPath = join(SHOTS_DIR, `assert-${Date.now()}.png`);
          await screenshotUrl(url, outputPath);
          shotPath = outputPath;
          lastScreenshot = outputPath;
        }
        if (!shotPath || !existsSync(shotPath)) {
          throw new Error('No screenshot available. Pass url parameter or run take_screenshot first.');
        }
        const result = await ocrImage(shotPath);
        const needle = expectedText.toLowerCase();
        const found = result.fullText.toLowerCase().includes(needle);
        const matchedBlock = result.blocks.find(b => b.text.toLowerCase().includes(needle));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              pass: found,
              expectedText,
              matchedText: matchedBlock?.text ?? null,
              matchedAt: matchedBlock?.bbox ?? null,
              screenshotPath: shotPath,
            }),
          }],
        };
      }

      case 'describe_layout': {
        const { url, fullPage } = args as { url: string; fullPage?: boolean };
        const outputPath = join(SHOTS_DIR, `layout-${Date.now()}.png`);
        await screenshotUrl(url, outputPath, { fullPage });
        lastScreenshot = outputPath;

        const result = await ocrImage(outputPath);
        const meta = await getImageMeta(outputPath);

        const elements = result.blocks.map(block => ({
          text: block.text,
          confidence: block.confidence,
          bbox: block.bbox,
          elementType: inferElementType(block, meta.width, meta.height),
        }));

        const elementsByType: Record<string, typeof elements> = {};
        for (const el of elements) {
          if (!elementsByType[el.elementType]) elementsByType[el.elementType] = [];
          elementsByType[el.elementType].push(el);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              url,
              screenshotPath: outputPath,
              dimensions: { width: meta.width, height: meta.height },
              totalTextBlocks: elements.length,
              elementsByType,
              allElements: elements,
            }),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message }) }],
      isError: true,
    };
  }
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
