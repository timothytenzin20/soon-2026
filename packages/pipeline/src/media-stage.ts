import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { audit, mediaAssets, mediaFrames, mediaManifests, type Db } from "@mb/db";
import {
  analyzeImage,
  assignScenes,
  extractFrames,
  makeTempDir,
  MediaRejection,
  normalizeImage,
  probeVideo,
  readHead,
  selectFrames,
  sha256File,
  sniff,
  transcodeProxy,
} from "@mb/media";
import { log } from "@mb/observability";
import type { ObjectStore } from "@mb/storage";
import { createHash } from "node:crypto";
import type { PipelineConfig } from "./config";

export const MEDIA_TOOL_VERSION = "media-prep-v1";

/**
 * ValidateMedia + PrepareMedia for one asset. Idempotent: an asset already
 * ready/rejected is left alone; partial frame rows from a crashed attempt are replaced.
 */
export async function processMediaAsset(db: Db, store: ObjectStore, cfg: PipelineConfig, assetId: string): Promise<"ready" | "rejected" | "skipped"> {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
  if (!asset) throw new Error(`asset ${assetId} not found`);
  if (asset.status === "ready" || asset.status === "rejected") return "skipped";

  const src = await store.localPath(asset.originalObjectKey);
  const tmp = await makeTempDir();
  try {
    // ---- ValidateMedia -------------------------------------------------------------
    const size = await store.size(asset.originalObjectKey);
    if (size == null || size === 0) throw new MediaRejection("empty_file", "The uploaded file was empty.");
    if (size > cfg.maxUploadBytes) throw new MediaRejection("too_large", "The file is larger than the allowed size.");
    const type = sniff(await readHead(src));
    if (!type) throw new MediaRejection("unsupported_type", "This file type isn't supported. Please upload a JPG, PNG, HEIC, MP4, MOV or WebM file.");
    if (type.kind !== asset.kind) throw new MediaRejection("type_mismatch", "The file contents don't match its type.");
    const sha256 = await sha256File(src);
    const [dup] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.assessmentId, asset.assessmentId), eq(mediaAssets.sha256, sha256), ne(mediaAssets.id, asset.id), eq(mediaAssets.status, "ready")));
    if (dup) throw new MediaRejection("duplicate", "This file was already uploaded for this assessment.");

    await db.update(mediaAssets).set({ status: "processing", sha256, mime: type.mime }).where(eq(mediaAssets.id, asset.id));
    await db.delete(mediaFrames).where(eq(mediaFrames.assetId, asset.id)); // clean partial attempt

    const base = `assessments/${asset.assessmentId}/derived/${asset.id}`;
    const frameRows: (typeof mediaFrames.$inferInsert)[] = [];
    let durationMs: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let hasAudio: boolean | null = null;
    let proxyObjectKey: string | null = null;

    if (type.kind === "video") {
      // ---- PrepareMedia: video -----------------------------------------------------
      const probe = await probeVideo(src);
      if (probe.durationMs > cfg.maxVideoSeconds * 1000) throw new MediaRejection("too_long", `Videos can be up to ${Math.round(cfg.maxVideoSeconds / 60)} minutes long.`);
      ({ durationMs, width, height, hasAudio } = probe);
      const proxyPath = path.join(tmp, "proxy.mp4");
      await transcodeProxy(src, proxyPath);
      proxyObjectKey = `${base}/proxy.mp4`;
      await store.putFile(proxyObjectKey, proxyPath);

      const extracted = await extractFrames(src, path.join(tmp, "frames"), cfg.frameIntervalSeconds, probe.durationMs);
      const analyzed = [];
      for (const f of extracted) analyzed.push({ ...f, q: await analyzeImage(f.file) });
      const scenes = assignScenes(analyzed.map((a) => a.q.ahash));
      const candidates = analyzed.map((a, i) => ({ sharpness: a.q.sharpness, flags: a.q.flags, sceneIndex: scenes[i]!, timestampMs: a.timestampMs }));
      const chosen = selectFrames(candidates, cfg.maxFramesPerVideo);
      for (let i = 0; i < analyzed.length; i++) {
        const a = analyzed[i]!;
        const key = `${base}/frames/${String(i).padStart(5, "0")}.jpg`;
        await store.putFile(key, a.file);
        frameRows.push({
          assetId: asset.id,
          assessmentId: asset.assessmentId,
          timestampMs: a.timestampMs,
          objectKey: key,
          sceneIndex: scenes[i]!,
          width: a.q.width,
          height: a.q.height,
          sharpness: a.q.sharpness,
          brightness: a.q.brightness,
          qualityFlags: a.q.flags,
          selected: chosen.has(i),
        });
      }
    } else {
      // ---- PrepareMedia: still image (metadata stripped on re-encode) ----------------
      const normalized = await normalizeImage(src);
      const q = await analyzeImage(normalized);
      ({ width, height } = q);
      const key = `${base}/frames/still.jpg`;
      await store.putBuffer(key, normalized, "image/jpeg");
      frameRows.push({
        assetId: asset.id,
        assessmentId: asset.assessmentId,
        timestampMs: null,
        objectKey: key,
        sceneIndex: 0,
        width: q.width,
        height: q.height,
        sharpness: q.sharpness,
        brightness: q.brightness,
        qualityFlags: q.flags,
        selected: !q.flags.includes("too_dark") && !q.flags.includes("overexposed"),
      });
    }

    const inserted = frameRows.length ? await db.insert(mediaFrames).values(frameRows).returning() : [];
    const poster = inserted.find((f) => f.selected) ?? inserted[0];
    const manifest = {
      tool: MEDIA_TOOL_VERSION,
      assetId: asset.id,
      kind: type.kind,
      mime: type.mime,
      sha256,
      durationMs,
      width,
      height,
      frameIntervalSeconds: type.kind === "video" ? cfg.frameIntervalSeconds : null,
      audio: hasAudio ? "present_not_processed_no_consent" : "none",
      frames: inserted.map((f) => ({ id: f.id, timestampMs: f.timestampMs, sceneIndex: f.sceneIndex, sharpness: Math.round(f.sharpness * 100) / 100, flags: f.qualityFlags, selected: f.selected })),
    };
    await db.insert(mediaManifests).values({
      assetId: asset.id,
      version: 1,
      manifest,
      contentHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    });
    await db
      .update(mediaAssets)
      .set({ status: "ready", durationMs, width, height, hasAudio, proxyObjectKey, posterObjectKey: poster?.objectKey ?? null })
      .where(eq(mediaAssets.id, asset.id));
    await audit(db, { orgId: asset.orgId, actorType: "system", action: "media.ready", resourceType: "media_asset", resourceId: asset.id, metadata: { frames: inserted.length, selected: inserted.filter((f) => f.selected).length } });
    return "ready";
  } catch (e) {
    if (e instanceof MediaRejection) {
      await db.update(mediaAssets).set({ status: "rejected", rejectionReason: e.customerMessage }).where(eq(mediaAssets.id, asset.id));
      await audit(db, { orgId: asset.orgId, actorType: "system", action: "media.rejected", resourceType: "media_asset", resourceId: asset.id, metadata: { code: e.code } });
      log.warn("media.rejected", { assetId: asset.id, code: e.code });
      return "rejected";
    }
    throw e;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
