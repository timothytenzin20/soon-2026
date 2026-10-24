import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { assessmentRuns, assessments, mediaAssets, reportVersions } from "@mb/db";
import { authorize } from "@mb/domain";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Analytics" };

/** Measured values only. Projections (savings, revenue) are deliberately absent until real data exists. */
export default async function Analytics() {
  const p = await requireStaff();
  if (!authorize(p, "analytics.read").allowed) notFound();
  const org = eq(assessments.orgId, p.orgId);
  const [created] = await db().select({ n: count() }).from(assessments).where(org);
  const [submitted] = await db().select({ n: count() }).from(assessments).where(and(org, isNotNull(assessments.submittedAt)));
  const [answered] = await db().select({ n: count() }).from(assessments).where(and(org, sql`${assessments.status} IN ('ready_preview','inconclusive')`));
  const [inconclusive] = await db().select({ n: count() }).from(assessments).where(and(org, eq(assessments.status, "inconclusive")));
  const [failed] = await db().select({ n: count() }).from(assessments).where(and(org, eq(assessments.status, "failed")));
  const [timing] = await db()
    .select({ p50: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from (${assessments.completedAt} - ${assessments.submittedAt})))`, p90: sql<number>`percentile_cont(0.9) within group (order by extract(epoch from (${assessments.completedAt} - ${assessments.submittedAt})))` })
    .from(assessments)
    .where(and(org, isNotNull(assessments.completedAt), isNotNull(assessments.submittedAt)));
  const [cost] = await db().select({ total: sql<string>`coalesce(sum(${assessmentRuns.costUsd}),0)`, runs: count() }).from(assessmentRuns);
  const [media] = await db().select({ bytes: sql<string>`coalesce(sum(${mediaAssets.sizeBytes}),0)`, n: count() }).from(mediaAssets).where(eq(mediaAssets.orgId, p.orgId));
  const [fallbacks] = await db().select({ n: count() }).from(reportVersions).where(sql`(${reportVersions.validation}->>'fallbackUsed')::boolean = true`);

  const funnel = [
    { label: "Started", n: created?.n ?? 0 },
    { label: "Submitted", n: submitted?.n ?? 0 },
    { label: "Results delivered", n: answered?.n ?? 0 },
    { label: "Paid detailed report", n: 0, note: "billing disabled" },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.n));
  const mins = (s: number | null | undefined) => (s == null ? "-" : `${(Number(s) / 60).toFixed(1)} min`);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Analytics</h1>
        <p className="muted small">All figures measured from this system&apos;s records. No projected savings or revenue are shown.</p>
      </div>
      <section className="card stack">
        <h2 style={{ fontSize: "var(--text-xl)" }}>Funnel (all time)</h2>
        {funnel.map((f) => (
          <div key={f.label} className="stack" style={{ gap: 0 }}>
            <div className="spread small">
              <span>{f.label}</span>
              <span>
                {f.n}
                {f.note && <span className="muted"> ({f.note})</span>}
              </span>
            </div>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${(f.n / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>
      <div className="grid-3">
        <div className="card stat">
          <span className="stat-value">{mins(timing?.p50)}</span>
          <span className="stat-label">Median submit → results (p90 {mins(timing?.p90)})</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{inconclusive?.n ?? 0}</span>
          <span className="stat-label">Inconclusive results</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{failed?.n ?? 0}</span>
          <span className="stat-label">Processing failures</span>
        </div>
        <div className="card stat">
          <span className="stat-value">${Number(cost?.total ?? 0).toFixed(2)}</span>
          <span className="stat-label">Model cost, {cost?.runs ?? 0} runs (USD, token-estimated)</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{(Number(media?.bytes ?? 0) / 1024 / 1024).toFixed(0)} MB</span>
          <span className="stat-label">Stored originals ({media?.n ?? 0} files)</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{fallbacks?.n ?? 0}</span>
          <span className="stat-label">Reports withheld by validation gate</span>
        </div>
      </div>
    </div>
  );
}
