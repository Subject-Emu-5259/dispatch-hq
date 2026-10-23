import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeatherStatusStrip } from './WeatherStatusStrip';
import { useGameStore } from '@/stores/gameStore';

// The weather status strip (v0.22.16) gives severe weather the same Alerts-tab
// treatment as the disaster strip: pinned card with a live countdown while the
// event is active, hidden when the skies clear.

const now = Date.now();

function seedWeather(overrides: Record<string, unknown> = {}) {
  useGameStore.setState({
    weatherEvent: {
      id: 'storm',
      name: 'Severe Thunderstorm',
      icon: '⛈️',
      effect: '+30% response time',
      startedAt: now,
      duration: 120,
      ...overrides,
    },
  });
}

beforeEach(() => {
  useGameStore.setState({ weatherEvent: null });
});

describe('WeatherStatusStrip', () => {
  it('renders nothing when no severe weather is active', () => {
    render(<WeatherStatusStrip />);
    expect(screen.queryByText(/Thunderstorm/)).toBeNull();
  });

  it('shows the event name, effect, and a live countdown', () => {
    seedWeather();
    render(<WeatherStatusStrip />);
    expect(screen.getByText(/Severe Thunderstorm/)).toBeTruthy();
    expect(screen.getByText(/\+30% response time/)).toBeTruthy();
    expect(screen.getByText(/2:00/)).toBeTruthy(); // 120s countdown
  });

  it('counts down toward zero', () => {
    seedWeather({ startedAt: now - 30_000 }); // 30s in → 90s left
    render(<WeatherStatusStrip />);
    expect(screen.getByText(/1:30/)).toBeTruthy();
  });

  it('renders nothing once the window has elapsed', () => {
    seedWeather({ startedAt: now - 130_000 }); // past the 120s duration
    render(<WeatherStatusStrip />);
    expect(screen.queryByText(/Thunderstorm/)).toBeNull();
  });
});
