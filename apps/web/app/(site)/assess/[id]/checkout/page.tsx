import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authorize, readFlags } from "@mb/domain";
import { assessmentResource } from "@mb/pipeline";
import { db, getPrincipal } from "@/lib/server";

export const metadata: Metadata = { title: "Checkout" };

/**
 * Phase 3 placeholder. Payment will use a provider-hosted checkout in test mode, and
 * entitlement will be issued ONLY from a verified, idempotent provider webhook, never
 * from this page or a client callback.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await getPrincipal();
  const { res } = await assessmentResource(db(), principal, id).catch(() => notFound());
  if (!authorize(principal, "assessment.read_preview", res).allowed) notFound();
  return (
    <div className="container narrow stack" style={{ paddingTop: "var(--space-6)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)" }}>Detailed report</h1>
      <div className="notice notice-info">
        {readFlags().billing
          ? "Test-mode checkout is not implemented yet in this build (Phase 3)."
          : "Purchasing isn't available yet. Pricing and refund policy are pending Mold Busters approval."}
      </div>
      <Link href={`/assess/${id}/results`}>← Back to my results</Link>
    </div>
  );
}
