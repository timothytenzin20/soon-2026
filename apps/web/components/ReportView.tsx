import type { EvidenceRef } from "@mb/domain";
import type { ReportContent } from "@mb/reporting";
import { GuidanceList, KpiStrip, Meter, OutcomeNotice } from "./Guidance";
import { HighlightGrid } from "./Highlights";
import { Tabs } from "./Tabs";

const CHIP: Record<string, { cls: string; label: string }> = {
  visual_observation: { cls: "chip-visual", label: "Seen" },
  customer_statement: { cls: "chip-customer", label: "You reported" },
  model_inference: { cls: "chip-model", label: "Inference" },
  reference_guidance: { cls: "chip-guidance", label: "Guidance" },
  instrument_measurement: { cls: "chip-guidance", label: "Measured" },
  professional_finding: { cls: "chip-guidance", label: "Professional" },
};

export function EvidenceChip({ r }: { r: EvidenceRef }) {
  const c = CHIP[r.type] ?? { cls: "", label: r.type };
  return <span className={`chip ${c.cls}`}>{c.label}</span>;
}

/**
 * Full report (PLAN §8): a deterministic rendering of a validated snapshot, laid out as
 * a dashboard with tabs. `frameUrls` holds short-lived signed URLs; `frameHref` lets admin
 * link evidence to the case video player.
 */
export function ReportView({ content, frameUrls, frameHref }: { content: ReportContent; frameUrls: Record<string, string>; frameHref?: (r: EvidenceRef) => string }) {
  const link = (r: EvidenceRef) => (r.frameId ? (frameHref ? frameHref(r) : `#ev-${r.frameId}`) : undefined);
  const findings = content.areas.flatMap((a) => a.findings.map((f) => ({ area: a.label, f })));
  const visualAreas = content.areas.filter((a) => a.findings.some((f) => f.kind === "visual")).length;
  const frames = content.evidenceGallery.filter((r, i, arr) => r.frameId && arr.findIndex((x) => x.frameId === r.frameId) === i);

  const overview = (
    <div className="dash">
      <section className="panel span-7">
        <h3 className="panel-title">Summary</h3>
        <ul className="compact-list">
          {content.summary.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {content.priorityReasons.length > 0 && <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>Timing based on: {content.priorityReasons.join("; ")}.</p>}
      </section>
      <section className="panel span-5">
        <h3 className="panel-title">Do this now</h3>
        <GuidanceList items={content.safetyGuidance} />
      </section>
      <section className="panel span-7">
        <h3 className="panel-title">Recommendations</h3>
        <table className="table table-compact">
          <tbody>
            {content.recommendations.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.text}</td>
                <td className="muted">{r.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel span-5">
        <h3 className="panel-title">Can&apos;t tell remotely</h3>
        <ul className="compact-list">
          {content.unknowns.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </section>
    </div>
  );

  const findingsTab = (
    <section className="panel">
      {findings.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          No area-level findings.
        </p>
      ) : (
        <table className="table table-compact table-responsive">
          <thead>
            <tr>
              <th>Area</th>
              <th>Finding</th>
              <th>Clarity</th>
              <th>Evidence</th>
              <th>Other explanations / unknown</th>
            </tr>
          </thead>
          <tbody>
            {findings.map(({ area, f }) => {
              const firstFrame = f.evidenceRefs.find((r) => r.frameId && frameUrls[r.frameId]);
              return (
                <tr key={f.id}>
                  <td data-label="Area">{area}</td>
                  <td data-label="Finding">{f.statement}</td>
                  <td data-label="Clarity">
                    <Meter strength={f.strength} />
                  </td>
                  <td data-label="Evidence">
                    <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                      {firstFrame && (
                        <a href={link(firstFrame)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className="thumb-sm" src={frameUrls[firstFrame.frameId!]} alt={firstFrame.label} loading="lazy" />
                        </a>
                      )}
                      <span className="xs">
                        <EvidenceChip r={f.evidenceRefs[0]!} /> {f.evidenceRefs.length > 1 ? `${f.evidenceRefs.length} items` : f.evidenceRefs[0]!.label}
                      </span>
                    </div>
                  </td>
                  <td data-label="Other / unknown" className="xs muted">
                    {[...f.alternatives, ...f.missing].join("; ") || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );

  const highlights = content.highlights ?? [];
  const evidenceTab = (
    <section className="panel stack">
      {highlights.length > 0 && (
        <>
          <div className="spread">
            <h3 className="panel-title" style={{ margin: 0 }}>
              Key frames
            </h3>
            <span className="xs muted">Boxes are approximate. Appearance alone can&apos;t confirm what a stain or spot is.</span>
          </div>
          <HighlightGrid items={highlights} urls={frameUrls} hrefFor={frameHref ? (h) => frameHref({ type: "visual_observation", id: h.observationId, label: h.sourceLabel, frameId: h.frameId }) : undefined} />
          <h3 className="panel-title" style={{ marginTop: "var(--space-4)" }}>
            All referenced frames
          </h3>
        </>
      )}
      {frames.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          No visual evidence.
        </p>
      ) : (
        <div className="evidence-grid">
          {frames.map((r) => (
            <a key={r.id} id={`ev-${r.frameId}`} href={frameHref ? frameHref(r) : undefined} className="evidence-thumb" style={{ textDecoration: "none" }}>
              {frameUrls[r.frameId!] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frameUrls[r.frameId!]} alt={r.label} loading="lazy" />
              ) : (
                <div style={{ aspectRatio: "4/3", background: "var(--color-neutral-bg)" }} />
              )}
              <span className="cap">{r.label}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );

  const answersTab = (
    <section className="panel">
      <p className="xs muted">Shown as you provided it. Not verified.</p>
      <table className="table table-compact">
        <tbody>
          {content.customerContext.map((c, i) => (
            <tr key={i}>
              <th scope="row" style={{ textTransform: "none", letterSpacing: 0, fontSize: "var(--text-sm)", width: "45%" }}>
                {c.label}
              </th>
              <td>{c.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  const checklistTab = (
    <section className="panel">
      <p className="xs muted">Suggestions only. Don&apos;t open walls or disturb materials.</p>
      <ul className="compact-list">
        {content.checklist.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );

  const aboutTab = (
    <section className="panel small">
      <p>{content.disclosure}</p>
      <ul className="compact-list">
        {content.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <table className="table table-compact xs" style={{ marginTop: "var(--space-4)" }}>
        <tbody>
          <tr>
            <th scope="row">Method</th>
            <td>{content.method}</td>
          </tr>
          <tr>
            <th scope="row">Vision model</th>
            <td>{content.provenance.isMock ? "Demo heuristic (no AI)" : `${content.provenance.modelProvider} ${content.provenance.model}`}</td>
          </tr>
          <tr>
            <th scope="row">Summary written by</th>
            <td>{content.provenance.summaryModel ?? "Rules"}</td>
          </tr>
          <tr>
            <th scope="row">Versions</th>
            <td className="mono">
              {content.provenance.promptVersion} · {content.provenance.ruleVersion} · {content.provenance.policyVersion} · {content.provenance.questionBankVersion}
            </td>
          </tr>
          <tr>
            <th scope="row">Input hash</th>
            <td className="mono">{content.provenance.inputSnapshotHash.slice(0, 16)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );

  return (
    <article className="stack">
      <div className="report-head">
        <div className="report-head-top">
          <span className="prelim-label xs">{content.reportType}</span>
          <span className="ref-chip">REF: {content.reference}</span>
        </div>
        <h1>{content.summary.headline}</h1>
        <div className="xs muted">
          {content.property.type}, {content.property.region} · {new Date(content.generatedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </div>
      <OutcomeNotice outcome={content.outcome} reasons={content.outcomeReasons} />
      <KpiStrip
        priority={content.priority}
        outcome={content.outcome}
        areasWithFindings={visualAreas}
        areasTotal={content.areas.length}
        evidence={content.evidenceGallery.length}
      />
      <Tabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "findings", label: `Findings (${findings.length})`, content: findingsTab },
          { id: "evidence", label: `Evidence (${frames.length})`, content: evidenceTab },
          { id: "answers", label: "Your answers", content: answersTab },
          { id: "checklist", label: "Checklist", content: checklistTab },
          { id: "about", label: "About this report", content: aboutTab },
        ]}
      />
    </article>
  );
}
