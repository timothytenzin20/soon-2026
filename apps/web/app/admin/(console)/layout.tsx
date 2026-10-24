import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { users } from "@mb/db";
import { aiStatus } from "@mb/ai";
import { authorize } from "@mb/domain";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { db, getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const p = await getPrincipal();
  if (p.kind !== "staff") redirect("/admin/login");
  const ai = aiStatus();
  const [u] = await db().select({ name: users.displayName, email: users.email }).from(users).where(eq(users.id, p.userId));
  const can = (a: Parameters<typeof authorize>[1]) => authorize(p, a).allowed;
  const links = [
    { href: "/admin", label: "Overview", show: true },
    { href: "/admin/assessments", label: "Assessments", show: can("assessment.list") },
    { href: "/admin/clients", label: "Clients", show: can("client.read") },
    { href: "/admin/jobs", label: "Jobs", show: can("job.read") },
    { href: "/admin/contractors", label: "Contractors", show: can("contractor.read") },
    { href: "/admin/reports", label: "Reports", show: can("report.manage_templates") },
    { href: "/admin/analytics", label: "Analytics", show: can("analytics.read") },
    { href: "/admin/settings", label: "Settings", show: can("settings.read") },
  ].filter((l) => l.show);
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin" className="wordmark" style={{ display: "inline-block" }}>
          Mold Busters
        </Link>
        <div className="xs" style={{ opacity: 0.8, marginTop: "var(--space-2)" }}>
          Operations
        </div>
        <AdminNav links={links} />
        <div className="who">
          <div>{u?.name ?? u?.email}</div>
          <div>Role: {p.role}</div>
          <SignOutButton />
        </div>
      </aside>
      <main id="main" className="admin-main">
        {!ai.configured && (
          <div className="banner-alert">
            AI model not configured. Set {ai.keyVar} in .env, run pnpm ai:check, then restart. New screenings fail until then.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
