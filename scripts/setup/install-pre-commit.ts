#!/usr/bin/env tsx
/**
 * Installs a git pre-commit hook that runs `npm run check` before every commit.
 * Usage: npm run check:install-hook
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// Find .git directory
let gitRoot = PROJECT_ROOT;
try {
  gitRoot = execSync('git rev-parse --git-dir', { cwd: PROJECT_ROOT }).toString().trim();
  if (!gitRoot.startsWith('/')) gitRoot = join(PROJECT_ROOT, gitRoot);
} catch {
  console.error('Not inside a git repository. Initialize one with: git init');
  process.exit(1);
}

const hooksDir = join(gitRoot, 'hooks');
const hookPath = join(hooksDir, 'pre-commit');

mkdirSync(hooksDir, { recursive: true });

const hookScript = `#!/bin/sh
# Auto-installed by npm run check:install-hook
# Runs TypeScript check + audit before every commit

echo "Running pre-commit quality check..."
cd "${PROJECT_ROOT}"
npm run check

if [ $? -ne 0 ]; then
  echo ""
  echo "Pre-commit check FAILED. Fix TypeScript errors or audit issues before committing."
  echo "To skip (not recommended): git commit --no-verify"
  exit 1
fi

echo "Pre-commit check passed."
`;

const alreadyExists = existsSync(hookPath);
writeFileSync(hookPath, hookScript, 'utf-8');
chmodSync(hookPath, 0o755);

if (alreadyExists) {
  console.log(`Pre-commit hook updated: ${hookPath}`);
} else {
  console.log(`Pre-commit hook installed: ${hookPath}`);
}
console.log('Every `git commit` will now run `npm run check` first.');
console.log('To bypass: git commit --no-verify');
