import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { customerProfiles, getDb, memberships, sessions, type Db } from "@mb/db";
import { ForbiddenError, type Principal, type StaffRole } from "@mb/domain";
import { log } from "@mb/observability";
import { NotFoundError, readPipelineConfig, ValidationError } from "@mb/pipeline";
import { getStore } from "@mb/storage";

export const db = (): Db => getDb();
export const store = () => getStore();
export const pipelineConfig = () => readPipelineConfig();

const COOKIE = "mb_session";
const CUSTOMER_TTL_MS = 30 * 24 * 3600_000;
const STAFF_TTL_MS = 12 * 3600_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Opaque random token in an httpOnly cookie; only its hash is stored server-side. */
export async function startSession(input: { kind: "customer"; orgId: string; customerId: string } | { kind: "staff"; orgId: string; userId: string }) {
  const token = randomBytes(32).toString("base64url");
  const ttl = input.kind === "staff" ? STAFF_TTL_MS : CUSTOMER_TTL_MS;
  await db()
    .insert(sessions)
    .values({
      tokenHash: sha256(token),
      kind: input.kind,
      orgId: input.orgId,
      customerId: input.kind === "customer" ? input.customerId : null,
      userId: input.kind === "staff" ? input.userId : null,
      reauthenticatedAt: input.kind === "staff" ? new Date() : null,
      expiresAt: new Date(Date.now() + ttl),
    });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(COOKIE);
}

export async function getPrincipal(): Promise<Principal> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return { kind: "anonymous" };
  const [s] = await db()
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!s) return { kind: "anonymous" };
  if (s.kind === "staff" && s.userId) {
    const [m] = await db().select().from(memberships).where(and(eq(memberships.userId, s.userId), eq(memberships.orgId, s.orgId)));
    if (!m || m.role === "customer") return { kind: "anonymous" };
    return { kind: "staff", orgId: s.orgId, userId: s.userId, role: m.role as StaffRole, reauthenticatedAt: s.reauthenticatedAt };
  }
  if (s.kind === "customer" && s.customerId) {
    const [c] = await db().select().from(customerProfiles).where(eq(customerProfiles.id, s.customerId));
    if (!c) return { kind: "anonymous" };
    return { kind: "customer", orgId: s.orgId, customerId: c.id, userId: c.userId, emailVerified: !!c.emailVerifiedAt };
  }
  return { kind: "anonymous" };
}

export async function requireStaff(): Promise<Extract<Principal, { kind: "staff" }>> {
  const p = await getPrincipal();
  if (p.kind !== "staff") redirect("/admin/login");
  return p;
}

export class UnauthenticatedError extends Error {}
export class RateLimitedError extends Error {}

/** CSRF defence for cookie-authenticated mutations: require a same-origin request. */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) throw new ForbiddenError("assessment.read", "missing_origin");
  if (new URL(origin).host !== host) throw new ForbiddenError("assessment.read", "cross_origin");
}

// In-memory fixed-window limiter. Per-instance only, replace with a shared store (Redis/Postgres) before scaling out.
const buckets = new Map<string, { count: number; reset: number }>();
export async function rateLimit(name: string, limit: number, windowMs: number) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const key = `${name}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) buckets.set(key, { count: 1, reset: now + windowMs });
  else if (++b.count > limit) throw new RateLimitedError();
}

/** Map domain errors to HTTP. Authorization failures on customer resources look like 404 (no existence leak). */
export function apiError(e: unknown) {
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (e instanceof ForbiddenError) {
    if (e.reason === "cross_origin" || e.reason === "missing_origin") return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (e instanceof UnauthenticatedError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (e instanceof RateLimitedError) return NextResponse.json({ error: "Too many requests, please wait a moment" }, { status: 429 });
  log.error("api.unhandled", { error: e });
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return apiError(e);
    }
  };
}
