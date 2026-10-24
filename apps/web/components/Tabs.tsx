"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

/** Accessible client-side tabs. Panels are server-rendered nodes, so no extra data fetching. */
export function Tabs({ tabs, initial }: { tabs: { id: string; label: string; content: ReactNode }[]; initial?: string }) {
  const [active, setActive] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const base = useId();
  function onKey(e: KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
    setActive(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  }
  return (
    <div>
      <div className="ctab-list no-print" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
