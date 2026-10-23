// ============================================
// Dispatch HQ — Inline Rename
// ============================================
// Pencil button that swaps the label for an inline input. Enter or blur
// commits (trimmed, maxLength-capped), Esc cancels. Reused by the unit,
// station, and fleet panels so renaming feels identical everywhere.

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';

export function InlineRename({
  value,
  onSave,
  maxLength = 30,
  buttonClassName,
  inputClassName,
}: {
  value: string;
  onSave: (name: string) => void;
  maxLength?: number;
  buttonClassName?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when the user cancels (Esc) so a blur fired around the same time
  // can never save the edit anyway.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditing(false);
      return;
    }
    const trimmed = draft.trim().slice(0, maxLength);
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        title="Rename"
        className={buttonClassName ?? 'p-1 rounded-md hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors shrink-0'}
      >
        <Pencil className="w-3 h-3" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        onBlur={commit}
        maxLength={maxLength}
        className={inputClassName ?? 'w-32 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500'}
      />
      {/* preventDefault on mousedown keeps focus in the input so blur-commit
          can't fire before these clicks; Check commits exactly once and
          Cancel actually cancels. */}
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); commit(); }}
        title="Save"
        className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400"
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); cancel(); }}
        title="Cancel"
        className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
