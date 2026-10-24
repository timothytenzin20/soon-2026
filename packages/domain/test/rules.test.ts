import { describe, expect, it } from "vitest";
import {
  canTransitionAssessment,
  canTransitionPayment,
  entitlementStateForPayment,
  findProhibited,
  getQuestion,
  normalizeAnswer,
  QUESTION_BANK,
  ROUTINE_QUESTION_CAP,
  selectFollowups,
  sanitizeRegion,
  type AreaId,
  type ConcernId,
} from "../src";

describe("assessment state machine", () => {
  it("follows the documented path", () => {
    const path = ["draft", "uploading", "queued", "processing", "needs_answers", "processing", "ready_preview"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransitionAssessment(path[i]!, path[i + 1]!)).toBe(true);
  });
  it("rejects skipping processing", () => {
    expect(canTransitionAssessment("draft", "ready_preview")).toBe(false);
    expect(canTransitionAssessment("needs_answers", "ready_preview")).toBe(false);
    expect(canTransitionAssessment("ready_preview", "processing")).toBe(false);
  });
});

describe("payment machine", () => {
  it("only succeeded grants; refund/dispute revoke", () => {
    expect(entitlementStateForPayment("succeeded")).toBe("active");
    expect(entitlementStateForPayment("pending")).toBe("none");
    expect(entitlementStateForPayment("refunded")).toBe("revoked");
    expect(canTransitionPayment("failed", "succeeded")).toBe(false);
    expect(canTransitionPayment("succeeded", "refunded")).toBe(true);
  });
});

describe("follow-up selection", () => {
  it("basement + musty odor asks only odor, recurrence and dehumidifier questions", () => {
    const ids = selectFollowups({ areas: ["basement"], concerns: ["musty_odor"], observationCategories: [], answeredQuestionIds: [] }).map((s) => s.question.id);
    expect(ids).toEqual(["odor_location", "recurrence", "dehumidification"]);
  });
  it("uses the model ranking but always keeps safety questions", () => {
    const base = { areas: ["laundry", "hvac_vents", "basement"] as AreaId[], concerns: ["musty_odor", "water_damage"] as ConcernId[], observationCategories: [], answeredQuestionIds: [] };
    expect(selectFollowups({ ...base, ranking: ["dryer_vent"] }).map((s) => s.question.id)).toEqual(["leak_ongoing", "water_event_timing", "affected_size", "dryer_vent"]);
    expect(selectFollowups({ ...base, ranking: [] }).map((s) => s.question.id)).toEqual(["leak_ongoing", "water_event_timing", "affected_size"]);
  });
  it("sizes use square metres only", () => {
    const labels = getQuestion("affected_size")!.options.map((o) => o.label).join(" ");
    expect(labels).toContain(`m${String.fromCharCode(0xb2)}`);
    expect(labels).not.toMatch(/doormat|hand|feet|ft\b/i);
  });
  it("safety-relevant questions come first and answered ones are skipped", () => {
    const sel = selectFollowups({ areas: ["bathroom"], concerns: ["active_leak", "visible_spots"], observationCategories: ["discoloration"], answeredQuestionIds: ["affected_size"] });
    expect(sel[0]!.question.id).toBe("leak_ongoing");
    expect(sel.map((s) => s.question.id)).not.toContain("affected_size");
  });
  it("vent discoloration triggers HVAC and dryer questions", () => {
    const ids = selectFollowups({ areas: ["laundry"], concerns: ["visible_spots"], observationCategories: ["ventilation_component"], answeredQuestionIds: [] }).map((s) => s.question.id);
    expect(ids).toContain("hvac_maintenance");
    expect(ids).toContain("dryer_vent");
  });
  it("caps at the routine limit", () => {
    const sel = selectFollowups({
      areas: ["basement", "bathroom", "laundry", "hvac_vents", "windows"],
      concerns: ["musty_odor", "visible_spots", "flooding", "condensation"],
      observationCategories: ["discoloration"],
      answeredQuestionIds: [],
    });
    expect(sel.length).toBe(ROUTINE_QUESTION_CAP);
  });
  it("every question offers a not-sure option", () => {
    for (const q of QUESTION_BANK) expect(q.options.some((o) => o.value === "not_sure")).toBe(true);
  });
  it("normalizes answers strictly to approved options", () => {
    expect(normalizeAnswer(getQuestion("leak_ongoing")!, "<script>")).toBeNull();
    expect(normalizeAnswer(getQuestion("leak_ongoing")!, "yes")).toBe("yes");
    expect(normalizeAnswer(getQuestion("leak_ongoing")!, ["yes"])).toBeNull();
  });
});

describe("prohibited assertions", () => {
  it.each([
    "This is Stachybotrys growth",
    "Toxic black mold is present",
    "Mold was detected on the vent",
    "We confirmed mold in the basement",
    "There is a 72% chance of mold",
    "This is causing your symptoms",
    "You have mold poisoning",
    "Swab results show contamination",
    "The home is safe to live in",
    "We detected a musty odor",
    "Remediation will cost $3,700",
  ])("blocks: %s", (t) => expect(findProhibited(t).length).toBeGreaterThan(0));

  it.each([
    "Appearance alone cannot confirm mold.",
    "Whether any discoloration is mold. Appearance alone cannot confirm this.",
    "Dark spotting visible on the vent grille slats.",
    "You reported a musty smell here.",
    "Do you have a humidity reading for this area?",
  ])("allows: %s", (t) => expect(findProhibited(t)).toEqual([]));
});

describe("highlight regions", () => {
  it("clamps boxes into the frame and drops useless ones", () => {
    expect(sanitizeRegion({ x: 0.8, y: -0.1, width: 0.5, height: 0.4 })).toEqual({ x: 0.8, y: 0, width: 0.19999999999999996, height: 0.4 });
    expect(sanitizeRegion({ x: 0.1, y: 0.1, width: 0.001, height: 0.5 })).toBeNull();
    expect(sanitizeRegion({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
    expect(sanitizeRegion(null)).toBeNull();
  });
});
