import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationProvider, NotificationPanel } from './NotificationCenter';
import { useUpdateNudge } from '@/hooks/useUpdateNudge';

function Harness() {
  useUpdateNudge();
  return <NotificationPanel isOpen onClose={() => {}} />;
}

// This jsdom env exposes no storage at all (Node 26 shadows the global), so
// the hook's bare localStorage calls get a Map-backed stand-in.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

function stubHealth(version: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: 'ok', game: 'Dispatch HQ', version }),
  }));
}

beforeAll(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

beforeEach(() => {
  (globalThis.localStorage as Storage).clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('useUpdateNudge', () => {
  it('shows the update notification when the server version is newer', async () => {
    stubHealth('99.0.0');
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Update available — reload to get the latest/i)).toBeTruthy(),
    );
    // Message names the live version and the reload action is attached.
    expect(screen.getByText(/v99\.0\.0 is live/i)).toBeTruthy();
  });

  it('stays silent when the server version matches the bundle', async () => {
    stubHealth('0.21.2'); // matches RELEASE_NOTES[0]
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(/Update available/i)).toBeNull();
  });

  it('stays silent when the version read fails (offline / dev)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(/Update available/i)).toBeNull();
  });

  it('nudges only once per version — a remount respects the dismissal', async () => {
    stubHealth('99.0.0');
    const { unmount } = render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Update available — reload to get the latest/i)).toBeTruthy(),
    );
    expect(localStorage.getItem('dhq_update_dismissed_99.0.0')).toBe('1');
    unmount();

    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(/Update available/i)).toBeNull();
  });

  it('re-checks when a backgrounded tab becomes visible (visibilitychange)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', game: 'Dispatch HQ', version: '0.21.2' }),
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <NotificationProvider>
          <Harness />
        </NotificationProvider>,
      );
      await vi.advanceTimersByTimeAsync(0); // flush the boot check
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Hidden → the handler must NOT fire a check.
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Past the 30s throttle, becoming visible again fires the check (mobile Safari).
      await vi.advanceTimersByTimeAsync(31_000);
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    }
  });

  it('throttles repeat checks on window focus (30s)', async () => {
    stubHealth('99.0.0');
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Update available — reload to get the latest/i)).toBeTruthy(),
    );
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 100));
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });
});
