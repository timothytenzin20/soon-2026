import { NextResponse } from "next/server";
import { removeMediaAsset } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, route, store } from "@/lib/server";

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ assetId: string }> }) => {
  await assertSameOrigin();
  const { assetId } = await ctx.params;
  await removeMediaAsset(db(), store(), await getPrincipal(), assetId);
  return NextResponse.json({ ok: true });
});
