import { NextResponse } from "next/server";
import { createAssessment, createDraft } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, rateLimit, route, startSession } from "@/lib/server";

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  await rateLimit("assessment.create", 10, 60 * 60_000);
  const principal = await getPrincipal();
  const body = await req.json().catch(() => ({}));
  const who = principal.kind === "customer" ? principal : ({ kind: "anonymous" } as const);
  // Media-first: { draft: true } creates an empty draft with consent only, so uploads can start immediately.
  const { assessment, customerId, orgId } = (body as { draft?: boolean }).draft ? await createDraft(db(), who, body) : await createAssessment(db(), who, body);
  if (principal.kind !== "customer") await startSession({ kind: "customer", orgId, customerId });
  return NextResponse.json({ id: assessment.id, reference: assessment.reference }, { status: 201 });
});
