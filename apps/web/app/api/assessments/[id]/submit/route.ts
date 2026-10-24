import { NextResponse } from "next/server";
import { submitAssessment } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, route } from "@/lib/server";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin();
  const { id } = await ctx.params;
  await submitAssessment(db(), await getPrincipal(), id);
  return NextResponse.json({ ok: true });
});
