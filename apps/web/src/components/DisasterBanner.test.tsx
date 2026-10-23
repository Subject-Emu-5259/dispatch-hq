import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisasterStatusChip, DisasterStatusStrip } from './DisasterBanner';
import { useGameStore } from '@/stores/gameStore';

// The disaster status pieces replaced the floating map banner (v0.22.13):
// active disasters live in the Notifications tab (strip) with a compact
// TopBar chip (countdown) for at-a-glance awareness. These tests pin the
// render logic — phase branch, countdown, contained-calls line, and the
// chip's click-through to the notifications panel.

const now = Date.now();

function seedDisaster(overrides: Record<string, unknown> = {}) {
  useGameStore.setState({
    activeDisaster: {
      id: 'tornado',
      name: 'Tornado Warning',
      icon: '🌪️',
      startedAt: now,
      endsAt: now + 120_000,
      spawned: 6,
      completed: 2,
      phase: 'active',
      ...overrides,
    },
  });
}

beforeEach(() => {
  useGameStore.setState({ activeDisaster: null });
});

describe('DisasterStatusChip (TopBar)', () => {
  it('renders nothing when no disaster is active', () => {
    const { container } = render(<DisasterStatusChip />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the disaster icon and a live countdown while active', () => {
    seedDisaster();
    render(<DisasterStatusChip onOpen={() => {}} />);
    expect(screen.getByText('🌪️')).toBeTruthy();
    expect(screen.getByText('Disaster')).toBeTruthy();
    // ~2:00 window (may tick a second between render and assertion)
    expect(screen.getByText(/^2:0\d$/)).toBeTruthy();
  });

  it('labels the recovery phase instead of Disaster', () => {
    seedDisaster({ phase: 'aftermath', aftermathEndsAt: now + 60_000 });
    render(<DisasterStatusChip onOpen={() => {}} />);
    expect(screen.getByText('Recovery')).toBeTruthy();
  });

  it('fires onOpen when clicked (opens the Notifications tab)', () => {
    seedDisaster();
    const onOpen = vi.fn();
    render(<DisasterStatusChip onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('DisasterStatusStrip (Notifications tab)', () => {
  it('renders nothing when no disaster is active', () => {
    const { container } = render(<DisasterStatusStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the emergency phase: name, countdown, and calls contained', () => {
    seedDisaster();
    render(<DisasterStatusStrip />);
    expect(screen.getByText('Tornado Warning')).toBeTruthy();
    expect(screen.getByText(/^2:0\d$/)).toBeTruthy();
    expect(screen.getByText('2/6 calls contained — dispatch units to the affected zone.')).toBeTruthy();
  });

  it('shows the recovery phase message', () => {
    seedDisaster({ phase: 'aftermath', aftermathEndsAt: now + 60_000 });
    render(<DisasterStatusStrip />);
    expect(screen.getByText('Recovery')).toBeTruthy();
    expect(screen.getByText('City returning to normal — recovery calls active in the affected zone.')).toBeTruthy();
  });
});
