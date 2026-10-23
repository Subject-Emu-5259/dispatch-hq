import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AdminPanel } from './AdminPanel';

// The console only renders when the overview fetch succeeds with the expected
// payload shape (counts + recentPlayers). Everything else shows a non-content
// state — this is the "black screen" regression guard.
const apiMock = vi.hoisted(() => ({
  fetchAdminOverview: vi.fn(),
  fetchAdminOnline: vi.fn().mockResolvedValue([]),
  fetchAdminBugReports: vi.fn(),
  fetchAdminPromoCodes: vi.fn(),
  fetchAdminRedemptions: vi.fn(),
  fetchAdminUpgrades: vi.fn(),
  fetchAnalyticsSummary: vi.fn().mockResolvedValue(null),
  fetchMaintenanceState: vi.fn().mockResolvedValue({ maintenance: false, reason: null, since: null, scheduledAt: null }),
  scheduleMaintenanceState: vi.fn(),
  adminBroadcast: vi.fn().mockResolvedValue({ sentTo: 3, deliveredToInbox: 40, chatPosted: true, kind: 'psa' }),
}));

vi.mock('@/lib/apiClient', () => ({
  fetchAdminOverview: apiMock.fetchAdminOverview,
  fetchAdminOnline: apiMock.fetchAdminOnline,
  fetchAdminBugReports: apiMock.fetchAdminBugReports,
  fetchAdminPromoCodes: apiMock.fetchAdminPromoCodes,
  fetchAdminRedemptions: apiMock.fetchAdminRedemptions,
  fetchAdminUpgrades: apiMock.fetchAdminUpgrades,
  fetchAnalyticsSummary: apiMock.fetchAnalyticsSummary,
  updateAdminBugReport: vi.fn().mockResolvedValue({}),
  fetchMaintenanceState: apiMock.fetchMaintenanceState,
  scheduleMaintenanceState: apiMock.scheduleMaintenanceState,
  adminBroadcast: apiMock.adminBroadcast,
  createPromoCode: vi.fn().mockResolvedValue({}),
  updatePromoCode: vi.fn().mockResolvedValue({}),
  adminGrantBonus: vi.fn().mockResolvedValue({}),
}));

const validOverview = {
  counts: { players: 12, online: 3, missionsToday: 40 },
  recentPlayers: [
    { id: 'p1', username: 'Founder', level: 20, xp: 500000, credits: 500000, lastActive: new Date().toISOString() },
    { id: 'p2', username: 'Smoke Bot', level: 3, xp: 900, credits: 900, lastActive: new Date().toISOString() },
  ],
  reportCounts: { new: 2, investigating: 1, fixed: 5, total: 8 },
  founderEmail: 'deandrewh26@gmail.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.fetchAdminOverview.mockResolvedValue(validOverview);
  apiMock.fetchAdminBugReports.mockResolvedValue({
    reports: [{ id: 'b1', title: 'Heat map too big', status: 'new' }],
    counts: { new: 2, investigating: 1, fixed: 5 },
    newThisWeek: 3,
  });
});

describe('AdminPanel', () => {
  it('renders the player list from a valid overview payload', async () => {
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Admin Console/i)).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Smoke Bot')).toBeTruthy());
    expect(screen.getByText('Lv 20 · 500,000 XP')).toBeTruthy();
    expect(screen.getAllByText('Founder').length).toBeGreaterThanOrEqual(2); // header badge + player row
    expect(screen.getByText('Recently Active')).toBeTruthy();
  });

  it('arms a scheduled maintenance window and shows the countdown chip', async () => {
    apiMock.fetchMaintenanceState.mockResolvedValue({ maintenance: false, reason: null, since: null, scheduledAt: null });
    apiMock.scheduleMaintenanceState.mockResolvedValue({
      maintenance: false, reason: null, since: null,
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const { container } = render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Admin Console/i)).toBeTruthy());
    const dt = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dt, { target: { value: '2026-08-20T03:00' } });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => expect(apiMock.scheduleMaintenanceState).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Scheduled for/i)).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('renders the weekly triage digest counts on the Bug Triage tab', async () => {
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Admin Console/i)).toBeTruthy());
    fireEvent.click(screen.getByText('Bug Triage'));
    fireEvent.click(screen.getByText(/Weekly Triage Digest/i));
    await waitFor(() => expect(screen.getByText('New 2')).toBeTruthy());
    expect(screen.getByText('Investigating 1')).toBeTruthy();
    expect(screen.getByText('Fixed 5')).toBeTruthy();
    expect(screen.getByText('+3 this week')).toBeTruthy();
  });

  it('shows the error state instead of a black screen when the payload is malformed', async () => {
    apiMock.fetchAdminOverview.mockResolvedValue({ unexpected: 'shape' });
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/couldn't/i)).toBeTruthy());
    expect(screen.queryByText('Smoke Bot')).toBeNull();
  });

  it('shows the error state when the fetch rejects', async () => {
    apiMock.fetchAdminOverview.mockRejectedValue(new Error('network down'));
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/couldn't/i)).toBeTruthy());
    expect(screen.queryByText('Smoke Bot')).toBeNull();
  });

  it('renders an empty state when there are no players', async () => {
    apiMock.fetchAdminOverview.mockResolvedValue({
      ...validOverview,
      recentPlayers: [],
    });
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/players yet/i)).toBeTruthy());
  });

  it('renders the live Online Now roster from the presence endpoint', async () => {
    apiMock.fetchAdminOnline.mockResolvedValue([
      { playerId: 'a1', username: 'Founder', allianceId: null, level: 14, city: 'West Memphis', activity: 'in_mission' },
      { playerId: 'a2', username: 'Night Owl', allianceId: 'all-9', level: 9, city: 'Nashville', activity: 'idle' },
    ]);
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Admin Console/i)).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Night Owl')).toBeTruthy());
    expect(screen.getByText(/Online Now \(2\)/i)).toBeTruthy();
    expect(screen.getByText('alliance')).toBeTruthy();
    // Rich presence: level, city, and live activity chips — not just usernames.
    expect(screen.getByText('Lv 14')).toBeTruthy();
    expect(screen.getByText('Lv 9')).toBeTruthy();
    expect(screen.getByText('West Memphis')).toBeTruthy();
    expect(screen.getByText('Nashville')).toBeTruthy();
    expect(screen.getByText('🚨 In a mission')).toBeTruthy();
    expect(screen.getByText('💤 Idle')).toBeTruthy();
    expect(screen.queryAllByText('in-game').length).toBe(0);
  });

  it('prefills the Bonuses tab when a player row is clicked', async () => {
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Smoke Bot')).toBeTruthy());
    // The grant button only appears on hover (opacity-0) but is still clickable.
    const row = screen.getByText('Smoke Bot').closest('div.group');
    const gift = row?.querySelector('button');
    fireEvent.click(gift as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText(/Grant a Bonus/i)).toBeTruthy());
    const input = screen.getByPlaceholderText('Player username') as HTMLInputElement;
    expect(input.value).toBe('Smoke Bot');
  });

  it('sends a PSA broadcast with the selected kind', async () => {
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Admin Console/i)).toBeTruthy());
    fireEvent.click(screen.getByText('Broadcast'));
    fireEvent.click(screen.getByText('PSA'));
    fireEvent.change(screen.getByPlaceholderText(/Message to every connected player/), {
      target: { value: 'Tornado warning in the west side' },
    });
    fireEvent.click(screen.getByText('Send PSA'));
    await waitFor(() =>
      expect(apiMock.adminBroadcast).toHaveBeenCalledWith(
        'Citywide PSA',
        'Tornado warning in the west side',
        'psa',
      ),
    );
    expect(screen.getByText(/PSA posted to Public Chat/)).toBeTruthy();
    expect(screen.getByText(/Delivered to 3 connected players/)).toBeTruthy();
    expect(screen.getByText(/Stored in 40 player inboxes/)).toBeTruthy();
  });

  it('hides guest accounts from the player list by default and reveals them via the toggle', async () => {
    apiMock.fetchAdminOverview.mockResolvedValue({
      ...validOverview,
      counts: { ...validOverview.counts, players: 3, guests: 1 },
      recentPlayers: [
        { username: 'Founder', level: 20, xp: 500000, lastActive: new Date().toISOString(), email: 'deandrewh26@gmail.com' },
        { username: 'Guest Racer', level: 2, xp: 40, lastActive: new Date().toISOString(), email: 'guest_ab12cd34@dispatchhq.game' },
      ],
    });
    render(<AdminPanel isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Founder')).toBeTruthy());
    // Guest hidden by default; toggle advertises the hidden count.
    expect(screen.queryByText('Guest Racer')).toBeNull();
    expect(screen.getByText(/Show guests \(1 hidden\)/i)).toBeTruthy();
    // Toggle reveals it, labeled as a guest.
    fireEvent.click(screen.getByText(/Show guests/i));
    await waitFor(() => expect(screen.getByText('Guest Racer')).toBeTruthy());
    expect(screen.getByText('guest')).toBeTruthy();
    expect(screen.getByText(/Hide guests/i)).toBeTruthy();
  });
});
