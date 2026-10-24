import type { Metadata } from "next";
import { readFlags } from "@mb/domain";
import { SEED_STAFF } from "@mb/pipeline";
import { DevLoginButtons } from "@/components/admin/DevLoginButtons";

export const metadata: Metadata = { title: "Staff sign-in" };

export default function AdminLogin() {
  const flags = readFlags();
  return (
    <main id="main" className="container narrow stack-lg" style={{ paddingTop: "var(--space-7)" }}>
      <div>
        <span className="wordmark">Mold Busters</span>
        <h1 style={{ fontSize: "var(--text-2xl)", marginTop: "var(--space-5)" }}>Staff sign-in</h1>
      </div>
      <div className="notice notice-info">
        Production sign-in will use the managed identity provider with MFA (see docs/SECURITY.md). It is not wired up in this build.
      </div>
      {flags.devLogin ? (
        <div className="card stack">
          <h2 style={{ fontSize: "var(--text-lg)" }}>Local development login</h2>
          <p className="small muted">Disabled automatically in production. Each account demonstrates a different role.</p>
          <DevLoginButtons staff={SEED_STAFF} />
        </div>
      ) : (
        <p className="muted">Development login is disabled.</p>
      )}
    </main>
  );
}
