import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { authorize } from "@mb/domain";
import { assessmentResource } from "@mb/pipeline";
import { ProgressTracker } from "@/components/ProgressTracker";
import { db, getPrincipal } from "@/lib/server";

export const metadata: Metadata = { title: "Processing" };

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await getPrincipal();
  const { res } = await assessmentResource(db(), principal, id).catch(() => notFound());
  if (!authorize(principal, "assessment.read", res).allowed) notFound();
  return (
    <div className="container narrow" style={{ paddingTop: "var(--space-6)" }}>
      <ProgressTracker id={id} />
    </div>
  );
}
