import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { mediaFrames, reportVersions } from "@mb/db";
import type { Principal } from "@mb/domain";
import type { ReportContent } from "@mb/reporting";
import { signedMediaUrl } from "@mb/storage";
import { db } from "./server";

export async function latestReport(assessmentId: string, opts: { publishedOnly: boolean }) {
  const where = opts.publishedOnly
    ? and(eq(reportVersions.assessmentId, assessmentId), eq(reportVersions.status, "published"))
    : eq(reportVersions.assessmentId, assessmentId);
  const [rv] = await db().select().from(reportVersions).where(where).orderBy(desc(reportVersions.version)).limit(1);
  return rv ? { ...rv, content: rv.content as ReportContent } : null;
}

/**
 * Short-lived signed URLs for frames referenced by a report. Callers MUST have already
 * authorized `media.read` for this assessment; this function only signs.
 */
export async function frameUrls(principal: Principal, assessmentId: string, frameIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(frameIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await db()
    .select({ id: mediaFrames.id, key: mediaFrames.objectKey })
    .from(mediaFrames)
    .where(and(eq(mediaFrames.assessmentId, assessmentId), inArray(mediaFrames.id, ids)));
  const sub = principal.kind === "staff" ? `staff:${principal.userId}` : principal.kind === "customer" ? `customer:${principal.customerId}` : "anon";
  return Object.fromEntries(rows.map((r) => [r.id, signedMediaUrl({ key: r.key, contentType: "image/jpeg", sub }, 10 * 60_000)]));
}

export function fmtTs(ms: number | null | undefined): string {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
