import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authorize, readFlags } from "@mb/domain";
import { assessmentResource } from "@mb/pipeline";
import { toPreview } from "@mb/reporting";
import { GuidanceList, KpiStrip, OutcomeNotice } from "@/components/Guidance";
import { HighlightGrid } from "@/components/Highlights";
import { frameUrls, latestReport } from "@/lib/reports";
import { db, getPrincipal } from "@/lib/server";

export const metadata: Metadata = { title: "Your results" };
export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await getPrincipal();
  const { a, res } = await assessmentResource(db(), principal, id).catch(() => notFound());
  if (!authorize(principal, "assessment.read_preview", res).allowed) notFound();
  if (a.status !== "ready_preview" && a.status !== "inconclusive") redirect(`/assess/${id}/progress`);

  const rv = await latestReport(a.id, { publishedOnly: true });
  const flags = readFlags();
  if (!rv) {
    return (
      <div className="container narrow" style={{ paddingTop: "var(--space-6)" }}>
        <div className="panel">
          <h1 style={{ fontSize: "var(--text-xl)" }}>Your results are being reviewed</h1>
          <p className="small" style={{ margin: 0 }}>
            Our team reviews screenings before release right now. They will appear here.
          </p>
        </div>
      </div>
    );
  }
  const p = toPreview(rv.content);
  const entitled = authorize(principal, "report.read_full", res).allowed;
  const withSigns = p.areasCovered.filter((x) => x.findingCount > 0).length;
  // Customers may view their own frames; URLs are short-lived and signed after this check.
  const urls = authorize(principal, "media.read", res).allowed ? await frameUrls(principal, a.id, p.highlights.map((h) => h.frameId)) : {};

  return (
    <div className="container" style={{ paddingTop: "var(--space-5)" }}>
      <div className="report-head">
        <div className="report-head-top">
          <span className="prelim-label xs">{p.reportType}</span>
          <span className="ref-chip">REF: {p.reference}</span>
        </div>
        <h1>{p.summary.headline}</h1>
      </div>

      <div className="stack">
        {p.provenance.isMock && <div className="notice notice-neutral small">Demo mode: no AI model was used for this screening.</div>}
        <OutcomeNotice outcome={p.outcome} reasons={p.outcomeReasons.filter((r) => !r.startsWith("Demo mode"))} />
        <KpiStrip priority={p.priority} outcome={p.outcome} areasWithFindings={withSigns} areasTotal={p.areasCovered.length} evidence={p.evidenceCount} />
        <section className="cta-card" aria-labelledby="next">
          <div>
            <h2 id="next" className="cta-card-title">
              Next steps
            </h2>
            <ul className="cta-card-list">
              {p.recommendations.map((r) => (
                <li key={r.id}>{r.text}</li>
              ))}
            </ul>
          </div>
          <div className="cta-card-actions">
            <a className="btn btn-on-orange" href="https://www.bustmold.com/" rel="noopener">
              Request an inspection
            </a>
            <a className="btn btn-outline-on-orange" href="tel:18775666653">
              Call 1-877-566-6653
            </a>
          </div>
        </section>
      </div>

      <div className="dash" style={{ marginTop: "var(--space-4)" }}>
        {p.highlights.length > 0 && (
          <section className="panel span-12" aria-labelledby="seen">
            <div className="spread" style={{ marginBottom: "var(--space-3)" }}>
              <h2 id="seen" className="panel-title" style={{ margin: 0 }}>
                What we saw in your media
              </h2>
              <span className="xs muted">Boxes are approximate. Appearance alone can&apos;t confirm what a stain or spot is.</span>
            </div>
            <HighlightGrid items={p.highlights} urls={urls} />
          </section>
        )}
        <section className="panel span-7" aria-labelledby="sum">
          <h2 id="sum" className="panel-title">
            Summary
          </h2>
          <ul className="compact-list">
            {p.summary.points.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {p.areasCovered.length > 0 && (
            <table className="table table-compact" style={{ marginTop: "var(--space-4)" }}>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Visible signs</th>
                </tr>
              </thead>
              <tbody>
                {p.areasCovered.map((x) => (
                  <tr key={x.label}>
                    <td>{x.label}</td>
                    <td>{x.findingCount > 0 ? <span className="badge badge-info">{x.findingCount} found</span> : <span className="badge badge-neutral">Reported only</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.priorityReasons.length > 0 && <p className="xs muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>Timing based on: {p.priorityReasons.join("; ")}.</p>}
        </section>

        <section className="panel span-5" aria-labelledby="safety">
          <h2 id="safety" className="panel-title">
            Do this now (free)
          </h2>
          <GuidanceList items={p.safetyGuidance} />
        </section>

        <section className="panel span-12" aria-labelledby="unknown">
          <h2 id="unknown" className="panel-title">
            Can&apos;t tell remotely
          </h2>
          <ul className="compact-list">
            {p.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </section>

        <section className="panel span-12 inline-cta" aria-label="Detailed report">
          <div>
            <strong>Detailed report</strong>
            <div className="small muted">Findings by area, every frame and timestamp, your answers, and a checklist.</div>
          </div>
          {entitled ? (
            <Link className="btn btn-primary btn-sm" href={`/assess/${a.id}/report`}>
              Open detailed report
            </Link>
          ) : flags.billing ? (
            <Link className="btn btn-primary btn-sm" href={`/assess/${a.id}/checkout`}>
              Unlock detailed report
            </Link>
          ) : (
            <span className="badge badge-neutral">Available soon</span>
          )}
        </section>
      </div>

      <p className="xs muted" style={{ marginTop: "var(--space-4)" }}>
        {p.disclosure}
      </p>
    </div>
  );
}
