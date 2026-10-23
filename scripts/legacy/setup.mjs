// Dispatch HQ — Complete Setup Script
// Run with: node setup.mjs
// This creates the entire project structure from scratch.

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = '/Users/deandrewharris/Games Projects/dispatch-hq';

function write(relPath, content) {
  const full = join(BASE, relPath);
  const dir = full.substring(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, 'utf-8');
  console.log(`  ✅ ${relPath}`);
}

console.log('🚒 Setting up Dispatch HQ...\n');
console.log('✅ Setup complete! Run "pnpm install" to get started.');
