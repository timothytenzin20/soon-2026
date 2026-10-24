import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { audit, memberships, users } from "@mb/db";
import { readFlags } from "@mb/domain";
import { assertSameOrigin, db, endSession, route, startSession } from "@/lib/server";

/** LOCAL DEVELOPMENT ONLY. Hard-disabled when NODE_ENV=production (see readFlags). */
export const POST = route(async (req: Request) => {
  if (!readFlags().devLogin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await assertSameOrigin();
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const [u] = await db().select().from(users).where(eq(users.email, String(email ?? "").toLowerCase()));
  if (!u) return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  const [m] = await db().select().from(memberships).where(eq(memberships.userId, u.id));
  if (!m || m.role === "customer") return NextResponse.json({ error: "Not staff" }, { status: 400 });
  await endSession();
  await startSession({ kind: "staff", orgId: m.orgId, userId: u.id });
  await audit(db(), { orgId: m.orgId, actorType: "staff", actorId: u.id, action: "auth.dev_login", resourceType: "user", resourceId: u.id });
  return NextResponse.json({ ok: true });
});
