import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { assessments } from "@mb/db";
import { customerPhase, type AssessmentStatus } from "@mb/domain";
import { db, getPrincipal } from "@/lib/server";

export const metadata: Metadata = { title: "My screenings" };
export const dynamic = "force-dynamic";

function hrefFor(id: string, status: string) {
  if (status === "draft" || status === "uploading") return `/assess/new?id=${id}`;
  if (status === "needs_answers") return `/assess/${id}/questions`;
  if (status === "ready_preview" || status === "inconclusive") return `/assess/${id}/results`;
  return `/assess/${id}/progress`;
}

/** Lists ONLY assessments owned by the current customer session. */
export default async function MyAssessments() {
  const principal = await getPrincipal();
  const rows =
    principal.kind === "customer"
      ? await db().select().from(assessments).where(eq(assessments.customerId, principal.customerId)).orderBy(desc(assessments.createdAt))
      : [];
  return (
    <div className="container narrow stack-lg" style={{ paddingTop: "var(--space-6)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)" }}>My screenings</h1>
      {rows.length === 0 ? (
        <div className="card stack">
          <p>No screenings on this device yet.</p>
          <p className="small muted">Coming back from another device? Email sign-in links are part of the next build phase.</p>
          <Link className="btn btn-primary" href="/assess/new">
            Start a screening
          </Link>
        </div>
      ) : (
        <ul className="list card">
          {rows.map((r) => (
            <li key={r.id} className="spread">
              <div>
                <Link href={hrefFor(r.id, r.status)} style={{ fontWeight: 600 }}>
                  {r.reference}
                </Link>
                <div className="small muted">Started {r.createdAt.toLocaleDateString("en-CA", { dateStyle: "medium" })}</div>
              </div>
              <span className="badge badge-neutral">{customerPhase(r.status as AssessmentStatus).label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
