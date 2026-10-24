import { describe, expect, it } from "vitest";
import { authorize, REAUTH_WINDOW_MS, type Principal } from "../src";

const ORG = "org-1";
const cust = (customerId: string): Principal => ({ kind: "customer", orgId: ORG, customerId, emailVerified: false });
const staff = (role: "staff" | "manager" | "owner" | "service_worker", userId = `u-${role}`, reauth?: Date): Principal => ({
  kind: "staff",
  orgId: ORG,
  userId,
  role,
  reauthenticatedAt: reauth,
});
const caseRes = { orgId: ORG, ownerCustomerId: "c-1", assignedStaffId: "u-assigned", status: "ready_preview" };

describe("authorize, customers (IDOR)", () => {
  it("owner can read own assessment, others cannot", () => {
    expect(authorize(cust("c-1"), "assessment.read", caseRes).allowed).toBe(true);
    expect(authorize(cust("c-2"), "assessment.read", caseRes)).toEqual({ allowed: false, reason: "not_owner" });
    expect(authorize(cust("c-2"), "media.read", caseRes).allowed).toBe(false);
  });
  it("full report requires ownership AND entitlement", () => {
    expect(authorize(cust("c-1"), "report.read_full", { ...caseRes, entitled: false }).reason).toBe("no_entitlement");
    expect(authorize(cust("c-1"), "report.read_full", { ...caseRes, entitled: true }).allowed).toBe(true);
    expect(authorize(cust("c-2"), "report.read_full", { ...caseRes, entitled: true }).allowed).toBe(false);
  });
  it("customers can never perform staff actions", () => {
    for (const a of ["assessment.list", "contractor.read", "settings.read", "assessment.override", "audit.read"] as const) {
      expect(authorize(cust("c-1"), a, caseRes).allowed).toBe(false);
    }
  });
  it("draft edits only while draft/uploading", () => {
    expect(authorize(cust("c-1"), "assessment.edit_draft", { ...caseRes, status: "draft" }).allowed).toBe(true);
    expect(authorize(cust("c-1"), "assessment.edit_draft", caseRes).allowed).toBe(false);
  });
  it("missing owner never matches", () => {
    expect(authorize(cust("c-1"), "assessment.read", { orgId: ORG }).allowed).toBe(false);
  });
});

describe("authorize, staff", () => {
  it("staff only see assigned cases unless granted", () => {
    expect(authorize(staff("staff", "u-assigned"), "assessment.read", caseRes).allowed).toBe(true);
    expect(authorize(staff("staff", "u-other"), "assessment.read", caseRes).reason).toBe("not_assigned_no_grant");
    expect(authorize(staff("staff", "u-other"), "media.read", { ...caseRes, activeGrantUserIds: ["u-other"] }).reason).toBe("elevated_grant");
  });
  it("managers are org-wide; staff cannot do manager actions", () => {
    expect(authorize(staff("manager"), "assessment.read", caseRes).allowed).toBe(true);
    expect(authorize(staff("staff"), "contractor.write").allowed).toBe(false);
    expect(authorize(staff("manager"), "contractor.write").allowed).toBe(true);
    expect(authorize(staff("staff"), "contractor.read").allowed).toBe(true);
  });
  it("service workers are job-scoped", () => {
    expect(authorize(staff("service_worker", "u-sw"), "assessment.read", { ...caseRes, jobAssigneeId: "u-sw" }).allowed).toBe(true);
    expect(authorize(staff("service_worker", "u-sw"), "assessment.read", caseRes).allowed).toBe(false);
    expect(authorize(staff("service_worker"), "contractor.read").allowed).toBe(false);
  });
  it("owner-only actions need recent re-authentication", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(authorize(staff("manager", "m", now), "settings.write_roles", {}, now).reason).toBe("owner_only");
    expect(authorize(staff("owner", "o"), "settings.write_roles", {}, now).reason).toBe("reauth_required");
    expect(authorize(staff("owner", "o", now), "settings.write_roles", {}, now).allowed).toBe(true);
    const stale = new Date(now.getTime() - REAUTH_WINDOW_MS - 1);
    expect(authorize(staff("owner", "o", stale), "payment.refund", {}, now).allowed).toBe(false);
  });
  it("cross-org access is denied for everyone", () => {
    expect(authorize(staff("owner", "o", new Date()), "assessment.read", { ...caseRes, orgId: "org-2" }).reason).toBe("cross_org");
    expect(authorize(cust("c-1"), "assessment.read", { ...caseRes, orgId: "org-2" }).reason).toBe("cross_org");
  });
  it("staff cannot answer for customers or create customer assessments", () => {
    expect(authorize(staff("owner"), "assessment.answer", caseRes).allowed).toBe(false);
    expect(authorize(staff("staff"), "assessment.create").allowed).toBe(false);
  });
  it("anonymous can only start an assessment", () => {
    expect(authorize({ kind: "anonymous" }, "assessment.create").allowed).toBe(true);
    expect(authorize({ kind: "anonymous" }, "assessment.read", caseRes).allowed).toBe(false);
  });
});
