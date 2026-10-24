import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { assessmentRuns, mediaAssets } from "@mb/db";
import { assertAuthorized, customerPhase, type AssessmentStatus } from "@mb/domain";
import { assessmentResource, updateDraftDetails } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, route } from "@/lib/server";

/** Status for polling. Honest phases only, no fabricated percentages. */
export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const principal = await getPrincipal();
  const { a, res } = await assessmentResource(db(), principal, id);
  assertAuthorized(principal, "assessment.read", res);
  const assets = await db()
    .select({ id: mediaAssets.id, kind: mediaAssets.kind, status: mediaAssets.status, rejectionReason: mediaAssets.rejectionReason, area: mediaAssets.area })
    .from(mediaAssets)
    .where(eq(mediaAssets.assessmentId, a.id));
  const [run] = await db()
    .select({ state: assessmentRuns.state })
    .from(assessmentRuns)
    .where(and(eq(assessmentRuns.assessmentId, a.id), eq(assessmentRuns.stage, "observe")))
    .orderBy(desc(assessmentRuns.startedAt))
    .limit(1);
  const review = !run ? "none" : run.state === "succeeded" ? "done" : run.state === "failed" ? "failed" : "running";
  return NextResponse.json(
    { id: a.id, reference: a.reference, status: a.status, phase: customerPhase(a.status as AssessmentStatus), assets, review },
    { headers: { "Cache-Control": "no-store" } },
  );
});

/** Save the details step of a draft (areas, concerns, statement, property type, region). */
export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin();
  const { id } = await ctx.params;
  await updateDraftDetails(db(), await getPrincipal(), id, await req.json().catch(() => ({})));
  return NextResponse.json({ ok: true });
});
