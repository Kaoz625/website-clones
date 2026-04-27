#!/usr/bin/env tsx
/**
 * Generates and installs a macOS launchd plist for the Securus monitor daemon.
 * Usage: npm run securus:monitor:install
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const HOME = process.env.HOME ?? '/Users/markususche';
const LOG_DIR = join(HOME, '.nyctailblazers');
const PLIST_PATH = join(HOME, 'Library', 'LaunchAgents', 'com.nyctailblazers.securus-monitor.plist');
const NODE_PATH = execSync('which node').toString().trim();
const TSX_PATH = execSync('which tsx 2>/dev/null || echo ""').toString().trim()
  || join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx');

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(join(HOME, 'Library', 'LaunchAgents'), { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nyctailblazers.securus-monitor</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${TSX_PATH}</string>
        <string>${join(PROJECT_ROOT, 'scripts', 'securus-monitor.ts')}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_ROOT}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${join(LOG_DIR, 'securus-monitor.log')}</string>

    <key>StandardErrorPath</key>
    <string>${join(LOG_DIR, 'securus-monitor-error.log')}</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>`;

writeFileSync(PLIST_PATH, plist, 'utf-8');
console.log(`Plist written: ${PLIST_PATH}`);

// Load the service
try {
  execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`);
  execSync(`launchctl load "${PLIST_PATH}"`);
  console.log('launchd service loaded and started.');
} catch (err) {
  console.error('Could not load launchd service:', (err as Error).message);
  console.log('You can load it manually with:');
  console.log(`  launchctl load "${PLIST_PATH}"`);
}

console.log('\nMonitor status:');
console.log(`  launchctl list | grep securus`);
console.log('\nView live logs:');
console.log(`  tail -f "${join(LOG_DIR, 'securus-monitor.log')}"`);
console.log(`  tail -f "${join(LOG_DIR, 'securus-monitor-error.log')}"`);
console.log('\nTo stop the monitor:');
console.log(`  launchctl unload "${PLIST_PATH}"`);
