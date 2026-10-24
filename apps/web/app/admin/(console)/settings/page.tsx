import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, organizations, users } from "@mb/db";
import { aiStatus } from "@mb/ai";
import { authorize, POLICY_VERSION, QUESTION_BANK_VERSION, readFlags } from "@mb/domain";
import { db, requireStaff } from "@/lib/server";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const p = await requireStaff();
  if (!authorize(p, "settings.read").allowed) notFound();
  const [org] = await db().select().from(organizations).where(eq(organizations.id, p.orgId));
  const team = await db().select({ name: users.displayName, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, p.orgId));
  const flags = readFlags();
  const s = org!.settings;
  const canEdit = authorize(p, "settings.write_roles").allowed;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Settings</h1>
        <p className="muted small">
          Read-only in this build. Changing roles, billing or AI policy will require the owner role with recent re-authentication{canEdit ? " (you currently qualify)" : ""}.
        </p>
      </div>
      <div className="grid-2">
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Feature flags</h2>
          <ul className="list small">
            {Object.entries(flags).map(([k, v]) => (
              <li key={k} className="spread">
                <span className="mono">{k}</span>
                <span className={`badge ${v ? "badge-success" : "badge-neutral"}`}>{v ? "on" : "off"}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Detailed report product</h2>
          <dl className="kv small">
            <dt>Price</dt>
            <dd>{s.reportPrice?.approved ? `${(s.reportPrice.amountCents / 100).toFixed(2)} ${s.reportPrice.currency}` : "Not set, pending business approval"}</dd>
            <dt>Taxes / refunds</dt>
            <dd>Not configured</dd>
          </dl>
        </section>
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>AI &amp; policy</h2>
          <dl className="kv small">
            <dt>Provider</dt>
            <dd>{aiStatus().provider} {aiStatus().configured ? <span className="badge badge-success">configured</span> : <span className="badge badge-danger">no API key</span>}</dd>
            <dt>Vision model</dt>
            <dd>{aiStatus().visionModel}</dd>
            <dt>Summary model</dt>
            <dd>{aiStatus().textModel}</dd>
            <dt>Frames per run</dt>
            <dd>{process.env.AI_MAX_FRAMES_PER_RUN ?? 12}</dd>
            <dt>Budget per run</dt>
            <dd>${process.env.AI_BUDGET_USD_PER_RUN ?? "1.50"} USD (soft, logged)</dd>
            <dt>Policy</dt>
            <dd className="mono">{POLICY_VERSION}</dd>
            <dt>Question bank</dt>
            <dd className="mono">{QUESTION_BANK_VERSION}</dd>
          </dl>
        </section>
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Retention</h2>
          <dl className="kv small">
            <dt>Media</dt>
            <dd>{s.retentionDays?.media ?? "-"} days (placeholder)</dd>
            <dt>Reports</dt>
            <dd>{s.retentionDays?.reports ?? "-"} days (placeholder)</dd>
          </dl>
          <p className="xs muted">Retention periods pending privacy/legal review.</p>
        </section>
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Integrations</h2>
          <ul className="list small">
            {["Close CRM", "FreshBooks", "Asana", "Google Calendar", "Dialpad", "Brain"].map((n) => (
              <li key={n} className="spread">
                <span>{n}</span>
                <span className="badge badge-neutral">not connected (mock adapter)</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card stack">
          <h2 style={{ fontSize: "var(--text-xl)" }}>Team</h2>
          <ul className="list small">
            {team.map((t) => (
              <li key={t.email} className="spread">
                <span>{t.name ?? t.email}</span>
                <span className="badge badge-neutral">{t.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
