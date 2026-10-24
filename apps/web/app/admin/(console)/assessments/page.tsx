import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assessments, properties, users } from "@mb/db";
import { ASSESSMENT_STATUSES, authorize, labelFor, REGIONS } from "@mb/domain";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PriorityBadge } from "@/components/Guidance";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Assessments" };

/** Operational queue: no contact details or media here (PLAN §2.2.3). */
export default async function AssessmentsList({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string; q?: string; mine?: string; client?: string }> }) {
  const p = await requireStaff();
  if (!authorize(p, "assessment.list").allowed) notFound();
  const sp = await searchParams;
  const where: SQL[] = [eq(assessments.orgId, p.orgId)];
  if (sp.status && (ASSESSMENT_STATUSES as readonly string[]).includes(sp.status)) where.push(eq(assessments.status, sp.status));
  if (sp.priority && ["routine", "soon", "prompt"].includes(sp.priority)) where.push(eq(assessments.priority, sp.priority));
  if (sp.q) where.push(ilike(assessments.reference, `%${sp.q.replace(/[%_]/g, "").slice(0, 20)}%`));
  if (sp.mine === "1") where.push(eq(assessments.assignedStaffId, p.userId));
  if (sp.client && /^[0-9a-f-]{36}$/i.test(sp.client)) where.push(eq(assessments.customerId, sp.client));
  const assignee = alias(users, "assignee");
  const rows = await db()
    .select({ a: assessments, region: properties.approximateRegion, assigneeName: assignee.displayName })
    .from(assessments)
    .leftJoin(properties, eq(properties.id, assessments.propertyId))
    .leftJoin(assignee, eq(assignee.id, assessments.assignedStaffId))
    .where(and(...where))
    .orderBy(desc(assessments.createdAt))
    .limit(100);

  return (
    <div>
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Assessments</h1>
      </div>
      <form className="filter-bar card" method="get">
        <div className="field">
          <label htmlFor="q">Reference</label>
          <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="MB-…" />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={sp.status ?? ""}>
            <option value="">Any</option>
            {ASSESSMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="priority">Timing</label>
          <select id="priority" name="priority" className="input" defaultValue={sp.priority ?? ""}>
            <option value="">Any</option>
            <option value="prompt">Address promptly</option>
            <option value="soon">Follow up soon</option>
            <option value="routine">Routine</option>
          </select>
        </div>
        <label className="consent" style={{ alignSelf: "center" }}>
          <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Assigned to me
        </label>
        <button className="btn btn-secondary btn-sm" type="submit">
          Filter
        </button>
      </form>
      <div className="card" style={{ marginTop: "var(--space-4)", padding: "var(--space-3)" }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: "var(--space-3)" }}>
            No assessments match.
          </p>
        ) : (
          <table className="table table-responsive">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Status</th>
                <th>Timing</th>
                <th>Modality</th>
                <th>Region</th>
                <th>Assigned</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, region, assigneeName }) => (
                <tr key={a.id}>
                  <td data-label="Reference">
                    <Link href={`/admin/assessments/${a.id}`} className="mono">
                      {a.reference}
                    </Link>
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={a.status} />
                  </td>
                  <td data-label="Timing">{a.priority ? <PriorityBadge priority={a.priority as "routine"} /> : <span className="muted">-</span>}</td>
                  <td data-label="Modality">{a.modality.replace("_", " ")}</td>
                  <td data-label="Region">{region ? labelFor(REGIONS, region) : "-"}</td>
                  <td data-label="Assigned">{assigneeName ?? <span className="muted">Unassigned</span>}</td>
                  <td data-label="Created">{a.createdAt.toLocaleString("en-CA", { dateStyle: "short", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
