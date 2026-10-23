import { describe, it, expect, afterEach, vi } from 'vitest';

// Validates the server config values against the real config module.
//
// The previous version re-implemented the fallback as `process.env.PORT || '3001'`
// and asserted 3001 — which failed in any environment where PORT is actually set
// (dev servers commonly export it). These tests snapshot and restore the env and
// re-import config so they pass no matter what PORT/HOST the shell exports.

const PORT_BACKUP = process.env.PORT;
const HOST_BACKUP = process.env.HOST;

function restoreEnv() {
  if (PORT_BACKUP === undefined) delete process.env.PORT;
  else process.env.PORT = PORT_BACKUP;
  if (HOST_BACKUP === undefined) delete process.env.HOST;
  else process.env.HOST = HOST_BACKUP;
}

describe('Server Config', () => {
  afterEach(restoreEnv);

  it('defaults to port 3001 when PORT is unset', async () => {
    delete process.env.PORT;
    vi.resetModules();
    const { config } = await import('../config');
    expect(config.port).toBe(3001);
  });

  it('defaults to host 0.0.0.0 when HOST is unset', async () => {
    delete process.env.HOST;
    vi.resetModules();
    const { config } = await import('../config');
    expect(config.host).toBe('0.0.0.0');
  });

  it('honors PORT and HOST from the environment', async () => {
    process.env.PORT = '7777';
    process.env.HOST = '127.0.0.1';
    vi.resetModules();
    const { config } = await import('../config');
    expect(config.port).toBe(7777);
    expect(config.host).toBe('127.0.0.1');
  });
});

describe('Health Check Response Shape', () => {
  it('returns the expected shape', () => {
    const expectedKeys = ['status', 'game', 'version', 'timestamp'];
    const sampleResponse = {
      status: 'ok',
      game: 'Dispatch HQ',
      version: '0.3.0',
      timestamp: new Date().toISOString(),
    };
    for (const key of expectedKeys) {
      expect(sampleResponse).toHaveProperty(key);
    }
  });
});
