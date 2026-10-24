"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { accessGrants, assessments, audit, enqueue, memberships, observations } from "@mb/db";
import { assertAuthorized } from "@mb/domain";
import { assessmentResource, JOB_TYPES, transitionAssessment } from "@mb/pipeline";
import { db, requireStaff } from "@/lib/server";

const GRANT_HOURS = 4;

export async function requestAccess(assessmentId: string, formData: FormData) {
  const p = await requireStaff();
  const { a, res } = await assessmentResource(db(), p, assessmentId);
  assertAuthorized(p, "assessment.request_access", res);
  const reason = z.string().trim().min(10).max(500).safeParse(formData.get("reason"));
  if (!reason.success) throw new Error("Please give a reason (at least 10 characters).");
  await db().insert(accessGrants).values({ orgId: a.orgId, assessmentId: a.id, staffUserId: p.userId, reason: reason.data, status: "requested" });
  await audit(db(), { orgId: a.orgId, actorType: "staff", actorId: p.userId, action: "access.requested", resourceType: "assessment", resourceId: a.id, metadata: { reasonLength: reason.data.length } });
  revalidatePath(`/admin/assessments/${a.id}`);
}

export async function decideGrant(assessmentId: string, grantId: string, approve: boolean) {
  const p = await requireStaff();
  const { a, res } = await assessmentResource(db(), p, assessmentId);
  assertAuthorized(p, "access_grant.approve", res);
  const [g] = await db().select().from(accessGrants).where(and(eq(accessGrants.id, grantId), eq(accessGrants.assessmentId, a.id), eq(accessGrants.status, "requested")));
  if (!g) throw new Error("Request not found");
  if (g.staffUserId === p.userId) throw new Error("You can't approve your own request");
  await db()
    .update(accessGrants)
    .set({ status: approve ? "approved" : "denied", decidedBy: p.userId, expiresAt: approve ? new Date(Date.now() + GRANT_HOURS * 3600_000) : null })
    .where(eq(accessGrants.id, g.id));
  await audit(db(), { orgId: a.orgId, actorType: "staff", actorId: p.userId, action: approve ? "access.approved" : "access.denied", resourceType: "assessment", resourceId: a.id, metadata: { grantId: g.id, staffUserId: g.staffUserId, hours: approve ? GRANT_HOURS : 0 } });
  revalidatePath(`/admin/assessments/${a.id}`);
}

export async function assignStaff(assessmentId: string, formData: FormData) {
  const p = await requireStaff();
  const { a, res } = await assessmentResource(db(), p, assessmentId);
  assertAuthorized(p, "assessment.override", res);
  const raw = String(formData.get("staffUserId") ?? "");
  let staffUserId: string | null = null;
  if (raw) {
    const [m] = await db().select().from(memberships).where(and(eq(memberships.userId, raw), eq(memberships.orgId, a.orgId)));
    if (!m || m.role === "customer") throw new Error("Not a staff member of this organization");
    staffUserId = raw;
  }
  await db().update(assessments).set({ assignedStaffId: staffUserId, updatedAt: new Date() }).where(eq(assessments.id, a.id));
  await audit(db(), { orgId: a.orgId, actorType: "staff", actorId: p.userId, action: "assessment.assigned", resourceType: "assessment", resourceId: a.id, metadata: { from: a.assignedStaffId, to: staffUserId } });
  revalidatePath(`/admin/assessments/${a.id}`);
}

export async function retryAssessment(assessmentId: string) {
  const p = await requireStaff();
  const { a, res } = await assessmentResource(db(), p, assessmentId);
  assertAuthorized(p, "assessment.override", res);
  if (a.status !== "failed") throw new Error("Only failed assessments can be retried");
  await transitionAssessment(db(), a.id, "failed", "queued", { lastErrorCode: null });
  await enqueue(db(), { type: JOB_TYPES.observe, payload: { assessmentId: a.id }, idempotencyKey: `observe:${a.id}:retry:${Date.now()}`, orgId: a.orgId });
  await audit(db(), { orgId: a.orgId, actorType: "staff", actorId: p.userId, action: "assessment.retried", resourceType: "assessment", resourceId: a.id });
  revalidatePath(`/admin/assessments/${a.id}`);
}

/** Staff correction: mark a model observation as wrong. Recorded for evaluation; never silently deleted. */
export async function rejectObservation(assessmentId: string, observationId: string, formData: FormData) {
  const p = await requireStaff();
  const { a, res } = await assessmentResource(db(), p, assessmentId);
  assertAuthorized(p, "assessment.override", res);
  const reason = z.string().trim().min(5).max(500).safeParse(formData.get("reason"));
  if (!reason.success) throw new Error("Please explain the correction.");
  const rows = await db()
    .update(observations)
    .set({ status: "rejected_by_staff" })
    .where(and(eq(observations.id, observationId), eq(observations.assessmentId, a.id), eq(observations.status, "active")))
    .returning({ id: observations.id });
  if (!rows.length) throw new Error("Observation not found");
  await audit(db(), { orgId: a.orgId, actorType: "staff", actorId: p.userId, action: "observation.rejected", resourceType: "observation", resourceId: observationId, metadata: { assessmentId: a.id, reason: reason.data } });
  revalidatePath(`/admin/assessments/${a.id}`);
}
