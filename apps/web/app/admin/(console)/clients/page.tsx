import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq, max } from "drizzle-orm";
import { assessments, customerProfiles } from "@mb/db";
import { authorize } from "@mb/domain";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Clients" };

/** CRM-lite. Contact details are shown only to managers+ here; staff see them per case when assigned. */
export default async function Clients() {
  const p = await requireStaff();
  if (!authorize(p, "client.read").allowed) notFound();
  const showContact = p.role === "manager" || p.role === "owner";
  const rows = await db()
    .select({ c: customerProfiles, n: count(assessments.id), last: max(assessments.createdAt) })
    .from(customerProfiles)
    .leftJoin(assessments, eq(assessments.customerId, customerProfiles.id))
    .where(eq(customerProfiles.orgId, p.orgId))
    .groupBy(customerProfiles.id)
    .orderBy(desc(max(assessments.createdAt)))
    .limit(100);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Clients</h1>
        <p className="small muted">Most screenings start anonymously; contact details appear once a customer verifies an email (next phase).</p>
      </div>
      <section className="card">
        <table className="table table-responsive">
          <thead>
            <tr>
              <th>Client</th>
              <th>Contact</th>
              <th>Screenings</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, n, last }) => (
              <tr key={c.id}>
                <td data-label="Client" className="mono">
                  {c.id.slice(0, 8)}
                </td>
                <td data-label="Contact">{showContact ? (c.email ?? <span className="muted">anonymous</span>) : <span className="muted">restricted</span>}</td>
                <td data-label="Screenings">
                  <Link href={`/admin/assessments?client=${c.id}`}>{n}</Link>
                </td>
                <td data-label="Last activity">{last ? new Date(last).toLocaleDateString("en-CA") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
