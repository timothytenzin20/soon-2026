import { NextResponse } from "next/server";
import { createUploadSession } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, pipelineConfig, rateLimit, route } from "@/lib/server";

/** Create (or resume, by browser fingerprint) a resumable upload session. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin();
  await rateLimit("upload.init", 60, 60 * 60_000);
  const { id } = await ctx.params;
  const s = await createUploadSession(db(), await getPrincipal(), pipelineConfig(), id, await req.json().catch(() => ({})));
  return NextResponse.json({ sessionId: s.id, receivedBytes: s.receivedBytes, size: s.declaredSize });
});
