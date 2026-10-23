#!/usr/bin/env node
// ============================================
// Dispatch HQ — Mermaid Docs Validation
// ============================================
// Validates every ```mermaid fenced block in the markdown docs in two passes:
//   1. Parse — mermaid's own grammar parser (fast, no browser).
//   2. Render — @mermaid-js/mermaid-cli (mmdc) renders each block to SVG in a
//      headless browser, catching layout/theme errors the parser can't.
// Exits 1 on the first failing block; failures print file:line + the reason.
//
// Why headless-shell: mermaid-cli's default (full Chrome for Testing) hits a
// CDP schema bug on recent builds ("Emulation.setDeviceMetricsOverride …
// deviceScaleFactor"), while the chrome-headless-shell build works fine. The
// check prefers an installed headless-shell and falls back to the default
// executable otherwise.
//
// Run:  pnpm check:docs
import { readdirSync, statSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mermaid from 'mermaid';
import puppeteer from 'puppeteer';
import { getInstalledBrowsers, computeExecutablePath } from '@puppeteer/browsers';

mermaid.initialize({ startOnLoad: false });

// Directories scanned for markdown (relative to the repo root) when no files
// are given explicitly (lint-staged passes staged .md files as args).
const ROOTS = ['docs', 'plans'];
const ARGS = process.argv.slice(2);
const MERMAID_BLOCK = /```mermaid\s*\n([\s\S]*?)```/g;
const CACHE_DIR = process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), '.cache', 'puppeteer');

const MMDC = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'mmdc');

/** Prefer an installed chrome-headless-shell (avoids the full-Chrome CDP bug). */
async function resolveExecutablePath() {
  try {
    const installed = await getInstalledBrowsers({ cacheDir: CACHE_DIR });
    const shell = installed.find((b) => b.browser === 'chrome-headless-shell');
    if (shell) {
      return computeExecutablePath({ browser: 'chrome-headless-shell', buildId: shell.buildId, cacheDir: CACHE_DIR });
    }
  } catch {
    /* fall through to the default executable */
  }
  return puppeteer.executablePath();
}

function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...markdownFiles(p));
    else if (extname(p) === '.md') out.push(p);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Render one diagram with mmdc. Returns '' on success, else a reason. */
function renderBlock(code, executablePath) {
  const dir = mkdtempSync(join(tmpdir(), 'dhq-mmdc-'));
  const input = join(dir, 'diagram.mmd');
  const output = join(dir, 'diagram.svg');
  const config = join(dir, 'puppeteer.json');
  writeFileSync(input, code, 'utf8');
  // --no-sandbox: required on some CI runners (root containers); harmless elsewhere.
  writeFileSync(config, JSON.stringify({ executablePath, args: ['--no-sandbox'] }), 'utf8');
  try {
    const result = spawnSync(MMDC, ['-i', input, '-o', output, '-b', 'transparent', '-q', '-p', config], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    if (result.status === 0) return '';
    const stderr = (result.stderr ?? '').trim().split('\n').slice(-6).join('\n');
    return `mmdc exited ${result.status ?? `(signal ${result.signal})`}\n${stderr || '(no output)'}`;
  } catch (err) {
    return `mmdc failed to start: ${err?.message ?? err}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (!statSync(MMDC, { throwIfNoEntry: false })) {
    console.error(`mermaid-cli binary not found at ${MMDC} — run pnpm install (Chromium downloads on postinstall).`);
    process.exit(1);
  }
  const executablePath = await resolveExecutablePath();

  const files = ARGS.length > 0
    ? ARGS.filter((f) => f.endsWith('.md') && statSync(f, { throwIfNoEntry: false }))
    : ROOTS.flatMap((r) => markdownFiles(r));
  if (ARGS.length > 0 && files.length === 0) {
    console.error('No markdown files found in the given arguments.');
    process.exit(1);
  }
  let blocks = 0;
  let failures = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    let match;
    MERMAID_BLOCK.lastIndex = 0;
    while ((match = MERMAID_BLOCK.exec(text)) !== null) {
      blocks += 1;
      const code = match[1];
      const line = lineOf(text, match.index);
      try {
        await mermaid.parse(code, { suppressErrors: false });
      } catch (err) {
        failures += 1;
        console.error(`  FAIL ${file}:${line} — parse: ${err?.message ?? err}`);
        continue;
      }
      const renderError = renderBlock(code, executablePath);
      if (renderError) {
        failures += 1;
        console.error(`  FAIL ${file}:${line} — render:\n${renderError}`);
      } else {
        console.log(`  ok  ${file}:${line} (parsed + rendered)`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures}/${blocks} mermaid block(s) FAILED`);
    process.exit(1);
  }
  console.log(`\n${blocks} mermaid block(s) checked — all parsed and rendered`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
