// ============================================\n// Dispatch HQ — Dispatch Center tab registry (STAGED batch)
// ============================================
// Step 1 of the CAD modularization: the tab list, service gating, and tab
// metadata live here instead of inline in UnifiedDispatchCenter, so a future
// tab is a registry entry + one render branch — the same three-edit pattern
// the service panels and Reddit's `districts` tab already used. Tab bodies
// stay inline in UnifiedDispatchCenter for now; later passes extract them
// into sibling modules (CallQueue, Board, RadioConsole, Roster, Assistant,
// CommLog — see README.md in this directory). Pure except for icon refs.
import { Phone, List, Radio, Users, Brain, Database, Landmark, HeartPulse, ClipboardList, MapPin } from 'lucide-react';
import type { ServiceType } from '@dispatch-hq/shared';

export type DispatchTab = 'calls' | 'board' | 'radio' | 'roster' | 'assistant' | 'alliance' | 'records' | 'jail' | 'hospital' | 'marshal' | 'districts';

/** Console tabs shared by every service. */
export const CORE_TABS: DispatchTab[] = ['calls', 'board', 'radio', 'roster', 'assistant', 'alliance', 'districts'];

/** Service-specific agency systems — each department only sees its own. */
export const SERVICE_TABS: Record<'fire' | 'police' | 'ems', DispatchTab[]> = {
  police: [...CORE_TABS, 'records', 'jail'],
  ems: [...CORE_TABS, 'hospital'],
  fire: [...CORE_TABS, 'marshal'],
};

export const TAB_META: Record<DispatchTab, { icon: any; label: string }> = {
  calls: { icon: Phone, label: 'Incoming' },
  board: { icon: List, label: 'Board' },
  radio: { icon: Radio, label: 'Radio' },
  roster: { icon: Users, label: 'Roster' },
  assistant: { icon: Brain, label: 'Assistant' },
  records: { icon: Database, label: 'Records' },
  jail: { icon: Landmark, label: 'County Jail' },
  hospital: { icon: HeartPulse, label: 'Hospital' },
  alliance: { icon: Users, label: 'Alliance' },
  marshal: { icon: ClipboardList, label: 'Fire Marshal' },
  districts: { icon: MapPin, label: 'Districts' },
};

/** Tabs visible for a service (null = all departments, e.g. no selection). */
export function visibleTabsFor(selectedService: ServiceType | null): DispatchTab[] {
  if (!selectedService) return [...CORE_TABS, 'records', 'jail', 'hospital', 'marshal'];
  return SERVICE_TABS[selectedService];
}
