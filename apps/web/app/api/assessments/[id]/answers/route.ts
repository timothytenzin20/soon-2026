import { NextResponse } from "next/server";
import { submitAnswers } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, route } from "@/lib/server";

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin();
  const { id } = await ctx.params;
  return NextResponse.json(await submitAnswers(db(), await getPrincipal(), id, await req.json().catch(() => ({}))));
});
