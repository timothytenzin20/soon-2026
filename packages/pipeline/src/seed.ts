import { eq } from "drizzle-orm";
import { contractorRates, contractors, memberships, organizations, users, type Db } from "@mb/db";
import { POLICY_VERSION, type StaffRole } from "@mb/domain";
import { DEFAULT_ORG_SLUG } from "./intake";

/**
 * Development seed. Staff accounts use the reserved `.test` TLD (cannot receive mail).
 * Contractors are FICTIONAL placeholders, clearly labelled, with unverified/quote-only
 * rates, never real businesses or scraped prices (PLAN §10).
 */
export const SEED_STAFF: { email: string; name: string; role: StaffRole }[] = [
  { email: "owner@moldbusters.test", name: "Olivia Owner (demo)", role: "owner" },
  { email: "manager@moldbusters.test", name: "Max Manager (demo)", role: "manager" },
  { email: "staff@moldbusters.test", name: "Sam Staff (demo)", role: "staff" },
  { email: "staff2@moldbusters.test", name: "Sasha Staff (demo)", role: "staff" },
  { email: "field@moldbusters.test", name: "Fran Field (demo)", role: "service_worker" },
];

export async function seedBase(db: Db) {
  let [org] = await db.select().from(organizations).where(eq(organizations.slug, DEFAULT_ORG_SLUG));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        slug: DEFAULT_ORG_SLUG,
        name: "Mold Busters",
        locale: "en-CA",
        serviceRegions: ["ON", "QC"],
        policyVersion: POLICY_VERSION,
        settings: {
          // Placeholder only, NOT approved pricing (PLAN §15.1).
          reportPrice: { amountCents: 0, currency: "CAD", label: "Price pending business approval", approved: false },
          supportPhone: "1-877-566-6653",
          retentionDays: { media: 365, reports: 2555 },
          ai: { provider: process.env.AI_PROVIDER ?? "mock", visionModel: process.env.AI_VISION_MODEL ?? "claude-opus-5-5", maxFramesPerRun: 12, budgetUsdPerRun: 1.5 },
        },
      })
      .returning();
  }
  const staff: Record<string, string> = {};
  for (const s of SEED_STAFF) {
    let [u] = await db.select().from(users).where(eq(users.email, s.email));
    if (!u) [u] = await db.insert(users).values({ email: s.email, displayName: s.name }).returning();
    await db.insert(memberships).values({ userId: u!.id, orgId: org!.id, role: s.role }).onConflictDoNothing();
    staff[s.role === "staff" && staff.staff ? "staff2" : s.role] = u!.id;
  }
  const existing = await db.select({ id: contractors.id }).from(contractors).where(eq(contractors.orgId, org!.id));
  if (existing.length === 0) {
    const sample = [
      {
        name: "Sample Plumbing Co. (fictional)",
        services: ["plumbing", "leak_repair"],
        serviceAreas: { postalPrefixes: ["K1", "K2"], regions: ["ON"], radiusKm: 40 },
        credentialStatus: "not_verified",
        rates: [{ serviceType: "leak_repair", rateType: "quote_only", amountCents: null, source: "seed placeholder" }],
      },
      {
        name: "Example Roofing Ltd. (fictional)",
        services: ["roofing"],
        serviceAreas: { postalPrefixes: ["K1", "J8", "J9"], regions: ["ON", "QC"], radiusKm: 60 },
        credentialStatus: "verified",
        verificationAt: new Date("2026-09-15"),
        credentials: ["Demo credential, replace with real record"],
        rates: [{ serviceType: "roof_inspection", rateType: "starting", amountCents: 25000, source: "seed placeholder (not a real quote)" }],
      },
      {
        name: "Demo Insulation Services (fictional)",
        services: ["insulation", "attic_ventilation"],
        serviceAreas: { postalPrefixes: ["H1", "H2", "H3"], regions: ["QC"], radiusKm: null },
        credentialStatus: "not_verified",
        rates: [],
      },
    ];
    for (const c of sample) {
      const [row] = await db
        .insert(contractors)
        .values({
          orgId: org!.id,
          name: c.name,
          services: c.services,
          serviceAreas: c.serviceAreas,
          contact: {},
          credentialStatus: c.credentialStatus,
          credentials: c.credentials ?? [],
          verificationAt: c.verificationAt ?? null,
          qualityNotes: "Fictional seed record for development.",
        })
        .returning();
      if (c.rates.length) await db.insert(contractorRates).values(c.rates.map((r) => ({ ...r, contractorId: row!.id, verifiedAt: null })));
    }
  }
  return { org: org!, staff };
}
