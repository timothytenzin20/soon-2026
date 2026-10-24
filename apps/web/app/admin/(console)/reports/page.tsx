import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { assessments, reportVersions } from "@mb/db";
import { authorize, POLICY_VERSION, QUESTION_BANK_VERSION } from "@mb/domain";
import { RULE_VERSION } from "@mb/reporting";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const p = await requireStaff();
  if (!authorize(p, "report.manage_templates").allowed) notFound();
  const rows = await db()
    .select({ rv: reportVersions, ref: assessments.reference })
    .from(reportVersions)
    .innerJoin(assessments, eq(assessments.id, reportVersions.assessmentId))
    .where(eq(assessments.orgId, p.orgId))
    .orderBy(desc(reportVersions.generatedAt))
    .limit(100);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Reports</h1>
        <p className="small muted">
          Active versions, template <span className="mono">report-v1</span> · rules <span className="mono">{RULE_VERSION}</span> · policy <span className="mono">{POLICY_VERSION}</span> · questions{" "}
          <span className="mono">{QUESTION_BANK_VERSION}</span>. Policy and question-bank versions are managed in code with review, not by editing prompts.
        </p>
      </div>
      <section className="card">
        <table className="table table-responsive">
          <thead>
            <tr>
              <th>Case</th>
              <th>Version</th>
              <th>Outcome</th>
              <th>Status</th>
              <th>Gate</th>
              <th>Generated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rv, ref }) => {
              const v = rv.validation as { passed: boolean; fallbackUsed?: boolean; issues: unknown[] };
              return (
                <tr key={rv.id}>
                  <td data-label="Case">
                    <Link className="mono" href={`/admin/assessments/${rv.assessmentId}?tab=report`}>
                      {ref}
                    </Link>
                  </td>
                  <td data-label="Version">v{rv.version}</td>
                  <td data-label="Outcome">{rv.outcome}</td>
                  <td data-label="Status">
                    <StatusBadge status={rv.status} />
                  </td>
                  <td data-label="Gate">{v.fallbackUsed ? <span className="badge badge-warning">withheld → fallback</span> : <span className="badge badge-success">passed</span>}</td>
                  <td data-label="Generated">{rv.generatedAt.toLocaleString("en-CA", { dateStyle: "short", timeStyle: "short" })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">No reports yet.</p>}
      </section>
    </div>
  );
}
