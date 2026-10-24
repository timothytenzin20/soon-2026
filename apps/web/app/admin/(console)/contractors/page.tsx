import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { contractorRates, contractors } from "@mb/db";
import { authorize, readFlags } from "@mb/domain";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Contractors" };

const RATE_LABEL: Record<string, string> = { fixed: "Fixed", starting: "Starting at", hourly: "Hourly", quote_only: "Quote only" };

/**
 * Internal-only directory (PLAN §10). No external accounts, no automatic outreach.
 * Unknown values are shown as "not verified", never filled in.
 */
export default async function ContractorsPage({ searchParams }: { searchParams: Promise<{ service?: string; region?: string; postal?: string; verified?: string; rate?: string }> }) {
  const p = await requireStaff();
  if (!authorize(p, "contractor.read").allowed) notFound();
  const sp = await searchParams;
  const rows = await db().select().from(contractors).where(eq(contractors.orgId, p.orgId));
  const rates = await db().select().from(contractorRates);
  const allServices = [...new Set(rows.flatMap((c) => c.services))].sort();
  const postal = sp.postal?.toUpperCase().replace(/\s/g, "").slice(0, 3);
  const filtered = rows.filter((c) => {
    if (!c.active) return false;
    if (sp.service && !c.services.includes(sp.service)) return false;
    if (sp.region && !c.serviceAreas.regions.includes(sp.region)) return false;
    if (postal && !c.serviceAreas.postalPrefixes.some((pp) => postal.startsWith(pp) || pp.startsWith(postal))) return false;
    if (sp.verified === "1" && c.credentialStatus !== "verified") return false;
    if (sp.rate && !rates.some((r) => r.contractorId === c.id && r.rateType === sp.rate)) return false;
    return true;
  });
  const flags = readFlags();
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Contractor directory</h1>
        <p className="muted small">Internal staff tool. Records come from maintained entries only, never from AI or web search snippets.</p>
      </div>
      {!flags.referrals && <div className="notice notice-neutral small">Referrals are disabled (feature flag). Directory is read-only reference until the referral workflow is approved.</div>}
      <form className="filter-bar card" method="get">
        <div className="field">
          <label htmlFor="service">Service</label>
          <select id="service" name="service" className="input" defaultValue={sp.service ?? ""}>
            <option value="">Any</option>
            {allServices.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="region">Region</label>
          <select id="region" name="region" className="input" defaultValue={sp.region ?? ""}>
            <option value="">Any</option>
            <option value="ON">Ontario</option>
            <option value="QC">Quebec</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="postal">Postal prefix</label>
          <input id="postal" name="postal" className="input" defaultValue={sp.postal} placeholder="K1A" maxLength={3} />
        </div>
        <div className="field">
          <label htmlFor="rate">Price type</label>
          <select id="rate" name="rate" className="input" defaultValue={sp.rate ?? ""}>
            <option value="">Any</option>
            {Object.entries(RATE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <label className="consent" style={{ alignSelf: "center" }}>
          <input type="checkbox" name="verified" value="1" defaultChecked={sp.verified === "1"} /> Verified only
        </label>
        <button className="btn btn-secondary btn-sm">Filter</button>
      </form>
      <div className="grid-2">
        {filtered.map((c) => {
          const cr = rates.filter((r) => r.contractorId === c.id);
          return (
            <article key={c.id} className="card stack">
              <div className="spread">
                <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>{c.name}</h2>
                <span className={`badge ${c.credentialStatus === "verified" ? "badge-success" : "badge-warning"}`}>{c.credentialStatus === "verified" ? "Credentials verified" : "Not verified"}</span>
              </div>
              <dl className="kv small">
                <dt>Services</dt>
                <dd>{c.services.map((s) => s.replace(/_/g, " ")).join(", ")}</dd>
                <dt>Coverage</dt>
                <dd>
                  {c.serviceAreas.regions.join(", ")} · prefixes {c.serviceAreas.postalPrefixes.join(", ") || "-"}
                  {c.serviceAreas.radiusKm ? ` · ~${c.serviceAreas.radiusKm} km stated radius` : " · radius not verified"}
                </dd>
                <dt>Pricing</dt>
                <dd>
                  {cr.length === 0
                    ? "Not verified"
                    : cr.map((r) => (
                        <div key={r.id}>
                          {r.serviceType.replace(/_/g, " ")}: {RATE_LABEL[r.rateType] ?? r.rateType}
                          {r.amountCents != null && ` $${(r.amountCents / 100).toFixed(0)} ${r.currency}`}
                          <span className="muted"> · source: {r.source}{r.verifiedAt ? `, verified ${r.verifiedAt.toLocaleDateString("en-CA")}` : ", not verified"}</span>
                        </div>
                      ))}
                </dd>
                <dt>Availability</dt>
                <dd>{c.availabilityNote ? `${c.availabilityNote} (source: ${c.availabilitySource ?? "unknown"}, as of ${c.availabilityAsOf?.toLocaleDateString("en-CA") ?? "unknown"})` : "Not verified"}</dd>
                <dt>Last verified</dt>
                <dd>{c.verificationAt?.toLocaleDateString("en-CA") ?? "Never"}</dd>
                {c.qualityNotes && (
                  <>
                    <dt>Notes</dt>
                    <dd>{c.qualityNotes}</dd>
                  </>
                )}
              </dl>
              <button className="btn btn-secondary btn-sm" disabled title="Referral workflow is Phase 4 and requires customer consent before sharing any details">
                Propose referral (Phase 4)
              </button>
            </article>
          );
        })}
        {filtered.length === 0 && <p className="muted">No contractors match these filters.</p>}
      </div>
    </div>
  );
}
