import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readFlags } from "@mb/domain";
import { appendUploadChunk, completeUpload, createUploadSession, MAX_CHUNK_BYTES, ValidationError } from "@mb/pipeline";
import { assertSameOrigin, db, getPrincipal, pipelineConfig, route, store } from "@/lib/server";

/**
 * LOCAL DEVELOPMENT ONLY. Attaches the sample video configured in SAMPLE_VIDEO_PATH to the
 * caller's own draft assessment, through the normal upload pipeline (same authz, validation
 * and processing as a browser upload). The client never supplies a path.
 */
export const POST = route(async (req: Request) => {
  if (!readFlags().devLogin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await assertSameOrigin();
  const file = process.env.SAMPLE_VIDEO_PATH;
  if (!file) throw new ValidationError("SAMPLE_VIDEO_PATH is not set in .env");
  const data = await fs.readFile(path.resolve(file)).catch(() => {
    throw new ValidationError(`Sample video not found at SAMPLE_VIDEO_PATH (${path.basename(file)})`);
  });
  const { assessmentId, area } = (await req.json().catch(() => ({}))) as { assessmentId?: string; area?: string };
  const principal = await getPrincipal();
  const session = await createUploadSession(db(), principal, pipelineConfig(), String(assessmentId ?? ""), {
    fingerprint: `dev-sample:${path.basename(file)}:${data.length}`,
    mime: "video/mp4",
    size: data.length,
    area,
  });
  let offset = session.receivedBytes;
  while (offset < data.length) {
    const r = await appendUploadChunk(db(), store(), principal, session.id, offset, data.subarray(offset, offset + MAX_CHUNK_BYTES));
    offset = r.receivedBytes;
  }
  const { assetId } = await completeUpload(db(), store(), principal, session.id);
  return NextResponse.json({ assetId, bytes: data.length, name: path.basename(file) });
});
