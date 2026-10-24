import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { assessments, auditEvents, jobs } from "@mb/db";
import { authorize } from "@mb/domain";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PriorityBadge } from "@/components/Guidance";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverview() {
  const p = await requireStaff();
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const byStatus = await db()
    .select({ status: assessments.status, n: count() })
    .from(assessments)
    .where(and(eq(assessments.orgId, p.orgId), gte(assessments.createdAt, since)))
    .groupBy(assessments.status);
  const n = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
  const total = byStatus.reduce((s, r) => s + r.n, 0);
  const queue = await db()
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.orgId, p.orgId),
        sql`(${assessments.status} = 'failed' OR (${assessments.priority} = 'prompt' AND ${assessments.status} IN ('ready_preview','inconclusive')) OR ${assessments.status} = 'inconclusive')`,
      ),
    )
    .orderBy(desc(assessments.updatedAt))
    .limit(10);
  const dead = await db().select({ n: count() }).from(jobs).where(eq(jobs.status, "dead"));
  const mine = await db()
    .select()
    .from(assessments)
    .where(and(eq(assessments.orgId, p.orgId), eq(assessments.assignedStaffId, p.userId), inArray(assessments.status, ["ready_preview", "inconclusive", "needs_answers", "processing"])))
    .limit(5);
  const activity = authorize(p, "audit.read").allowed
    ? await db().select().from(auditEvents).where(eq(auditEvents.orgId, p.orgId)).orderBy(desc(auditEvents.createdAt)).limit(8)
    : [];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Overview</h1>
        <p className="muted small">Last 30 days · measured from system records</p>
      </div>
      <div className="grid-3">
        <div className="card stat">
          <span className="stat-value">{total}</span>
          <span className="stat-label">New screenings</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{n("ready_preview") + n("inconclusive")}</span>
          <span className="stat-label">
            Results delivered ({n("inconclusive")} inconclusive)
          </span>
        </div>
        <div className="card stat">
          <span className="stat-value">{n("failed") + (dead[0]?.n ?? 0)}</span>
          <span className="stat-label">Processing failures (cases + dead jobs)</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{n("needs_answers")}</span>
          <span className="stat-label">Waiting on customer answers</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{n("queued") + n("processing")}</span>
          <span className="stat-label">In processing</span>
        </div>
        <div className="card stat">
          <span className="stat-value">-</span>
          <span className="stat-label">Paid reports (billing disabled)</span>
        </div>
      </div>

      <section className="card stack">
        <div className="spread">
          <h2 style={{ fontSize: "var(--text-xl)", margin: 0 }}>Needs attention</h2>
          <Link href="/admin/assessments">All assessments →</Link>
        </div>
        {queue.length === 0 ? (
          <p className="muted">Nothing needs attention right now.</p>
        ) : (
          <ul className="list">
            {queue.map((a) => (
              <li key={a.id} className="spread">
                <Link href={`/admin/assessments/${a.id}`} className="mono">
                  {a.reference}
                </Link>
                <span className="row">
                  {a.priority && <PriorityBadge priority={a.priority as "routine"} />}
                  <StatusBadge status={a.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mine.length > 0 && (
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Assigned to you</h2>
          <ul className="list">
            {mine.map((a) => (
              <li key={a.id} className="spread">
                <Link href={`/admin/assessments/${a.id}`} className="mono">
                  {a.reference}
                </Link>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {activity.length > 0 && (
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Recent activity</h2>
          <ul className="list small">
            {activity.map((e) => (
              <li key={e.id} className="spread">
                <span>
                  <span className="mono">{e.action}</span> <span className="muted">by {e.actorType}</span>
                </span>
                <time className="muted">{e.createdAt.toLocaleString("en-CA", { dateStyle: "short", timeStyle: "short" })}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
