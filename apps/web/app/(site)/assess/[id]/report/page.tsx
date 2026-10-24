import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authorize } from "@mb/domain";
import { assessmentResource } from "@mb/pipeline";
import { ReportView } from "@/components/ReportView";
import { frameUrls, latestReport } from "@/lib/reports";
import { db, getPrincipal } from "@/lib/server";

export const metadata: Metadata = { title: "Detailed report" };
export const dynamic = "force-dynamic";

/** Entitlement-gated full report. The report may exist before payment but is never shown without entitlement. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await getPrincipal();
  const { a, res } = await assessmentResource(db(), principal, id).catch(() => notFound());
  if (!authorize(principal, "assessment.read", res).allowed) notFound();
  if (!authorize(principal, "report.read_full", res).allowed) {
    return (
      <div className="container narrow stack" style={{ paddingTop: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>The detailed report is locked</h1>
        <p>Your free results, including all safety guidance, are always available.</p>
        <Link className="btn btn-primary" href={`/assess/${a.id}/results`}>
          Back to my results
        </Link>
      </div>
    );
  }
  const rv = await latestReport(a.id, { publishedOnly: true });
  if (!rv) notFound();
  const urls = authorize(principal, "media.read", res).allowed ? await frameUrls(principal, a.id, rv.content.evidenceGallery.map((r) => r.frameId!)) : {};
  return (
    <div className="container narrow" style={{ paddingTop: "var(--space-5)" }}>
      <div className="row no-print" style={{ marginBottom: "var(--space-4)" }}>
        <Link href={`/assess/${a.id}/results`}>← Results</Link>
        <span className="small muted">Version {rv.version}</span>
      </div>
      <ReportView content={rv.content} frameUrls={urls} />
    </div>
  );
}
