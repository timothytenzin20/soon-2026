import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { serviceJobs } from "@mb/db";
import { authorize, SERVICE_JOB_STATUSES } from "@mb/domain";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Jobs" };

export default async function Jobs() {
  const p = await requireStaff();
  if (!authorize(p, "job.read").allowed) notFound();
  const rows = await db().select().from(serviceJobs).where(eq(serviceJobs.orgId, p.orgId)).orderBy(desc(serviceJobs.createdAt)).limit(200);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Service jobs</h1>
        <p className="small muted">Inquiry → booking pipeline. Calendar, CRM and invoicing sync run through adapters that are mocked in this build (Phase 4).</p>
      </div>
      <div className="grid-3">
        {SERVICE_JOB_STATUSES.slice(0, 6).map((s) => {
          const list = rows.filter((r) => r.status === s);
          return (
            <section key={s} className="card stack">
              <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>
                {s.replace(/_/g, " ")} <span className="badge badge-neutral">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="small muted">None</p>
              ) : (
                <ul className="list small">
                  {list.map((j) => (
                    <li key={j.id}>{j.requestedServices.join(", ")}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
