import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';

const WHISPER_CLI = '/usr/local/Cellar/whisper-cpp/1.8.4/bin/whisper-cli';
const WHISPER_CLI_ALT = `${process.env.HOME}/.homebrew/bin/whisper-cli`;
// Prefer base model (much better with background noise) over tiny
const GGML_MODEL_BASE = `${process.env.HOME}/.cache/glaido-libre/models/ggml-base.bin`;
const GGML_MODEL_TINY = `${process.env.HOME}/.cache/glaido-libre/models/ggml-tiny.bin`;
const GGML_MODEL = existsSync(GGML_MODEL_BASE) ? GGML_MODEL_BASE : GGML_MODEL_TINY;
const WHISPER_PY = '/usr/local/bin/whisper';

function findWhisperCli(): string | null {
  // Try known paths and PATH
  for (const candidate of [WHISPER_CLI, WHISPER_CLI_ALT]) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    const p = execSync('which whisper-cli 2>/dev/null', { encoding: 'utf8' }).trim();
    if (p) return p;
  } catch { /* */ }
  // brew --prefix fallback
  try {
    const prefix = execSync('brew --prefix whisper-cpp 2>/dev/null', { encoding: 'utf8' }).trim();
    const bin = path.join(prefix, 'bin', 'whisper-cli');
    if (existsSync(bin)) return bin;
  } catch { /* */ }
  return null;
}

const whisperCli = findWhisperCli();

// Apply sox voice-frequency filter + normalize before transcription.
// Cuts TV/music frequencies, focuses whisper on human voice range (80–3000Hz).
function preprocessAudio(wavPath: string): string {
  const cleanedPath = wavPath.replace(/\.wav$/, '-clean.wav');
  try {
    execSync(
      `sox "${wavPath}" "${cleanedPath}" highpass 80 lowpass 3000 norm -3`,
      { timeout: 5_000, stdio: 'pipe' }
    );
    return cleanedPath;
  } catch {
    return wavPath; // sox not available or failed — use original
  }
}

export async function transcribe(wavPath: string): Promise<string> {
  const audioPath = preprocessAudio(wavPath);

  // Fast path: whisper-cpp C++ CLI (~2-3s on Intel, vs 15s for Python)
  if (whisperCli && existsSync(GGML_MODEL)) {
    const result = spawnSync(
      whisperCli,
      ['-m', GGML_MODEL, '-f', audioPath, '-np', '-nt', '-l', 'en'],
      { timeout: 30_000, encoding: 'utf8' }
    );
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
    if (result.stderr) console.warn('[glaido] whisper-cli:', result.stderr.slice(0, 200));
  }

  // Fallback: Python Whisper
  if (!existsSync(WHISPER_PY)) throw new Error('No transcription backend available');
  const outDir = '/tmp/glaido-transcribe';
  const baseName = path.basename(wavPath, path.extname(wavPath));
  const outFile = path.join(outDir, `${baseName}.txt`);
  if (existsSync(outFile)) unlinkSync(outFile);

  execSync(
    `mkdir -p ${outDir} && ${WHISPER_PY} "${wavPath}" --model tiny --output_format txt --output_dir "${outDir}" --language en --fp16 False`,
    { timeout: 60_000, stdio: 'pipe' }
  );

  if (!existsSync(outFile)) throw new Error('Whisper did not produce output file');
  const text = readFileSync(outFile, 'utf8').trim();
  unlinkSync(outFile);
  return text;
}

export function checkWhisper(): boolean {
  return (!!whisperCli && existsSync(GGML_MODEL)) || existsSync(WHISPER_PY);
}
