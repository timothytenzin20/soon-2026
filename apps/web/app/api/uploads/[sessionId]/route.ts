import { NextResponse } from "next/server";
import { appendUploadChunk, getUploadSession, MAX_CHUNK_BYTES, ValidationError } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, route, store } from "@/lib/server";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await ctx.params;
  const s = await getUploadSession(db(), await getPrincipal(), sessionId);
  return NextResponse.json({ receivedBytes: s.receivedBytes, size: s.declaredSize, status: s.status }, { headers: { "Cache-Control": "no-store" } });
});

/** Append one chunk at ?offset=N. A mismatched offset returns 409 with the server offset to resume from. */
export const PUT = route(async (req: Request, ctx: { params: Promise<{ sessionId: string }> }) => {
  await assertSameOrigin();
  const { sessionId } = await ctx.params;
  const offset = Number(new URL(req.url).searchParams.get("offset"));
  if (!Number.isInteger(offset) || offset < 0) throw new ValidationError("Invalid offset");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_CHUNK_BYTES) throw new ValidationError("Chunk too large");
  const chunk = Buffer.from(await req.arrayBuffer());
  const r = await appendUploadChunk(db(), store(), await getPrincipal(), sessionId, offset, chunk);
  return NextResponse.json({ receivedBytes: r.receivedBytes }, { status: r.conflict ? 409 : 200 });
});
