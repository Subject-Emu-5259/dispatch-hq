// ============================================
// Dispatch HQ — Unit Livery Picker
// ============================================
// Small swatch row for choosing a unit's paint scheme. Cosmetic only — the
// choice persists on the unit (rides in save payloads) and colors the marker.

import { LIVERIES, liveryFor } from '@dispatch-hq/shared';
import type { ServiceType } from '@dispatch-hq/shared';
import { Check } from 'lucide-react';

export function LiveryPicker({
  service,
  value,
  onChange,
  compact,
}: {
  service: ServiceType;
  value?: string;
  onChange: (liveryId: string) => void;
  compact?: boolean;
}) {
  const liveries = LIVERIES[service] ?? [];
  if (liveries.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {liveries.map((l) => {
        const active = liveryFor(service, value).id === l.id;
        return (
          <button
            key={l.id}
            title={l.name}
            onClick={() => onChange(l.id)}
            className={`relative rounded-full border transition-all ${
              active
                ? 'border-white ring-2 ring-offset-1 ring-offset-gray-900 ring-blue-400'
                : 'border-gray-600 hover:border-gray-400'
            } ${compact ? 'w-5 h-5' : 'w-6 h-6'}`}
            style={{
              background: `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]})`,
            }}
          >
            {active && (
              <Check
                className={`absolute inset-0 m-auto ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-white drop-shadow`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
