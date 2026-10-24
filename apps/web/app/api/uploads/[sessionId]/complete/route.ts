import { NextResponse } from "next/server";
import { completeUpload } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, route, store } from "@/lib/server";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ sessionId: string }> }) => {
  await assertSameOrigin();
  const { sessionId } = await ctx.params;
  return NextResponse.json(await completeUpload(db(), store(), await getPrincipal(), sessionId));
});
