import { PRIORITY_LABEL, type GuidanceEntry, type Priority } from "@mb/domain";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cls = priority === "prompt" ? "badge-warning" : priority === "soon" ? "badge-info" : "badge-neutral";
  return <span className={`badge ${cls}`}>{PRIORITY_LABEL[priority]}</span>;
}

const OUTCOME_LABEL: Record<string, string> = { qualified: "Full screening", limited: "Limited", inconclusive: "Inconclusive" };

/** Top-of-page KPI strip shared by the results page and the full report. */
export function KpiStrip({
  priority,
  outcome,
  outcomeNote,
  areasWithFindings,
  areasTotal,
  evidence,
}: {
  priority: Priority;
  outcome: string;
  outcomeNote?: string;
  areasWithFindings: number;
  areasTotal: number;
  evidence: number;
}) {
  return (
    <div className="kpis">
      <div className="kpi" data-tone={priority === "prompt" ? "alert" : priority === "soon" ? "warn" : undefined}>
        <span className="kpi-label">Timing</span>
        <span className="kpi-value">{PRIORITY_LABEL[priority]}</span>
      </div>
      <div className="kpi" data-tone={outcome === "qualified" ? undefined : "warn"}>
        <span className="kpi-label">Screening</span>
        <span className="kpi-value">{OUTCOME_LABEL[outcome] ?? outcome}</span>
        {outcomeNote && <span className="kpi-sub">{outcomeNote}</span>}
      </div>
      <div className="kpi">
        <span className="kpi-label">Areas with visible signs</span>
        <span className="kpi-value">
          {areasWithFindings} <span className="kpi-sub">of {areasTotal}</span>
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Evidence items</span>
        <span className="kpi-value">{evidence}</span>
        <span className="kpi-sub">linked to frames</span>
      </div>
    </div>
  );
}

/** Compact, expandable guidance: one line each, details on demand. */
export function GuidanceList({ items }: { items: GuidanceEntry[] }) {
  return (
    <div>
      {items.map((g) => (
        <details key={g.id} className="acc">
          <summary>{g.title}</summary>
          <div>
            <p style={{ marginBottom: "var(--space-1)" }}>{g.text}</p>
            <p className="xs muted" style={{ margin: 0 }}>
              Source:{" "}
              {g.source.url ? (
                <a href={g.source.url} rel="noopener">
                  {g.source.publisher}
                </a>
              ) : (
                g.source.publisher
              )}
              {g.reviewStatus !== "approved" && " (wording pending review)"}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}

export function OutcomeNotice({ outcome, reasons }: { outcome: string; reasons: string[] }) {
  if (outcome === "qualified" || reasons.length === 0) return null;
  return (
    <div className={`notice ${outcome === "inconclusive" ? "notice-warning" : "notice-info"} small`}>
      <strong>{outcome === "inconclusive" ? "Incomplete screening: " : "Limited screening: "}</strong>
      {reasons.join(" ")}
    </div>
  );
}

export function Meter({ strength }: { strength: string | null }) {
  const level = strength === "clear" ? 3 : strength === "moderate" ? 2 : strength === "weak" ? 1 : 0;
  const label = strength ? `Shown ${strength === "clear" ? "clearly" : strength === "moderate" ? "moderately clearly" : "weakly"}` : "Not shown in media";
  return (
    <span className="meter" data-level={level} role="img" aria-label={label} title={label}>
      <i />
      <i />
      <i />
    </span>
  );
}
