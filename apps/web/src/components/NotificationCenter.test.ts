import { describe, it, expect } from 'vitest';
import { maintenanceNoteKind } from './NotificationCenter';

describe('maintenanceNoteKind — inbox maintenance highlighting (v0.22.18)', () => {
  it('classifies the server-written started note', () => {
    expect(maintenanceNoteKind('🛠️ Maintenance Started')).toBe('started');
    expect(maintenanceNoteKind('🛠️ Maintenance Started')).toBe('started');
  });

  it('classifies the restored note', () => {
    expect(maintenanceNoteKind('✅ Online Restored')).toBe('restored');
  });

  it('returns null for ordinary inbox messages', () => {
    expect(maintenanceNoteKind('🎉 Weekly Wrap-up')).toBeNull();
    expect(maintenanceNoteKind('PSA: New promo code live')).toBeNull();
    expect(maintenanceNoteKind('')).toBeNull();
  });
});
