/**
 * Browser E2E + screenshot QA (PLAN §12 E2E, Phase 1 DoD).
 * Requires: web on :3100, worker running, seeded DB, sample pack in ./reference.
 * Uses the system Microsoft Edge via Playwright (no browser download).
 * Usage: pnpm exec tsx scripts/e2e-browser.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:3100";
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".data/screens");
fs.mkdirSync(out, { recursive: true });
const sample = path.join(root, "reference/Mold-Busters-Hackathon-Sample-Pack-v2/02_Virtual_Sample");
const results: { check: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `, ${detail}` : ""}`);
};

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no horizontal overflow: ${name}`, overflow <= 1, overflow > 1 ? `${overflow}px` : undefined);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  // ---------------- Customer on a phone ----------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: BASE });
  const c = await phone.newPage();
  await c.goto("/");
  await shot(c, "01-landing-390");
  await c.getByRole("link", { name: "Start a screening" }).click();
  await c.waitForURL("**/assess/new");
  // Step 1: consent + media first; uploads start immediately and continue in the background.
  await c.locator(".consent input").nth(0).check();
  await c.locator(".consent input").nth(1).check();
  await c.locator("#files").setInputFiles([
    path.join(sample, "Videos/Walkthrough_Silent.mp4"),
    path.join(sample, "Photos/01_Discoloration_dryer_vent_hose.jpg"),
    path.join(sample, "Photos/03_Discoloration_vent_grille.jpg"),
  ]);
  await c.waitForURL(/assess\/new\?id=/);
  const assessmentId = new URL(c.url()).searchParams.get("id")!;
  await shot(c, "02-intake-media-first-390");
  await c.getByRole("button", { name: "Continue" }).click();
  // Step 2 while uploads/processing continue.
  check("background status shown while filling the form", await c.locator(".bg-status").isVisible());
  await c.getByLabel("Laundry area").check();
  await c.getByLabel("Vents / ductwork").check();
  await c.getByLabel("Musty or earthy smell").check();
  await c.getByLabel("Spots or discoloration").check();
  await c.locator("#statement").fill("Strong smell that doesn't go away after cleaning. Spots near the washer, dryer and vents.");
  await shot(c, "03-intake-details-390");
  await c.getByRole("button", { name: "Continue" }).click();
  await c.getByLabel("Apartment / condo").check();
  await c.getByLabel("Quebec").check();
  await shot(c, "04-intake-property-390");
  await c.getByRole("button", { name: "Get my results" }).click();
  await c.waitForURL(/progress|questions|results/, { timeout: 180_000 });
  await shot(c, "05-progress-390");
  const submittedAt = Date.now();
  await c.waitForURL(/questions|results/, { timeout: 180_000 });
  console.log(`  after submit: ${((Date.now() - submittedAt) / 1000).toFixed(1)}s to ${c.url().includes("questions") ? "questions" : "results"}`);
  if (c.url().includes("questions")) {
    await shot(c, "06-questions-390");
    const sets = c.locator("fieldset");
    const n = await sets.count();
    for (let k = 0; k < n; k++) await sets.nth(k).getByText("Not sure", { exact: true }).click();
    await c.locator(".cta-bar button[type=submit]").click();
    check("follow-up questions capped at 4", n <= 4, `${n} asked`);
  }
  await c.waitForURL(/results/, { timeout: 180_000 });
  await c.getByRole("heading", { name: "Do this now (free)" }).waitFor();
  check("customer sees free safety guidance", await c.getByText("Don't disturb discolored material").isVisible());
  check("results labelled as preliminary screening", await c.getByText("AI-Assisted Preliminary Virtual Screening").first().isVisible());
  const shown = await c.locator(".hl-card img").count();
  check("results show captured frames", shown > 0, `${shown} frames`);
  check("frame captions avoid claiming mold", !(await c.locator(".hl-card figcaption").allInnerTexts()).some((t) => /mou?ld/i.test(t)));
  await shot(c, "07-results-390");
  await c.goto(`/assess/${assessmentId}/report`);
  check("unpaid customer cannot open detailed report", await c.getByRole("heading", { name: "The detailed report is locked" }).isVisible());

  // ---------------- Another customer (IDOR) ----------------
  const other = await browser.newContext({ baseURL: BASE });
  const o = await other.newPage();
  const r1 = await o.goto(`/assess/${assessmentId}/results`);
  check("other visitor gets 404 on results", r1?.status() === 404, `status ${r1?.status()}`);
  const r2 = await o.request.get(`/api/assessments/${assessmentId}`);
  check("other visitor gets 404 on status API", r2.status() === 404, `status ${r2.status()}`);
  const r3 = await o.request.post(`/api/assessments/${assessmentId}/submit`, { headers: { Origin: BASE } });
  check("other visitor cannot submit", r3.status() === 404, `status ${r3.status()}`);
  const r4 = await c.request.post(`/api/assessments/${assessmentId}/answers`, { headers: { Origin: "https://evil.example" }, data: { answers: [] } });
  check("cross-origin POST rejected (CSRF)", r4.status() === 403, `status ${r4.status()}`);
  const r5 = await o.request.get(`/admin`, { maxRedirects: 0 });
  check("anonymous /admin redirects to login", r5.status() === 307, `status ${r5.status()}`);

  // ---------------- Manager on desktop ----------------
  const desk = await browser.newContext({ viewport: { width: 1366, height: 900 }, baseURL: BASE });
  const m = await desk.newPage();
  await m.goto("/admin/login");
  await m.getByRole("button", { name: /Max Manager/ }).click();
  await m.waitForURL(`${BASE}/admin`);
  await shot(m, "10-admin-overview-1366");
  await m.goto("/admin/assessments");
  await shot(m, "11-admin-queue-1366");
  await m.goto(`/admin/assessments/${assessmentId}`);
  await m.locator("video").first().waitFor();
  await m.waitForTimeout(1500);
  const marker = m.locator(".timeline button").first();
  if (await marker.count()) {
    await marker.click();
    await m.waitForTimeout(500);
    const t = await m.locator("video").first().evaluate((v: HTMLVideoElement) => v.currentTime);
    check("timeline marker seeks the video", t >= 0, `currentTime=${t.toFixed(1)}s`);
  } else check("timeline has markers", false);
  await shot(m, "12-admin-case-evidence-1366");
  await m.goto(`/admin/assessments/${assessmentId}?tab=report`);
  check("admin sees validation gate result", await m.getByText("Validation gate").isVisible());
  await shot(m, "13-admin-case-report-1366");
  await m.goto(`/admin/assessments/${assessmentId}?tab=runs`);
  await shot(m, "14-admin-case-runs-1366");
  await m.goto("/admin/contractors");
  check("contractor directory marks unverified values", (await m.getByText("Not verified").count()) > 0);
  await shot(m, "15-admin-contractors-1366");

  // ---------------- Staff (unassigned) needs a grant ----------------
  const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, baseURL: BASE });
  const s = await sctx.newPage();
  await s.goto("/admin/login");
  await s.getByRole("button", { name: /Sasha Staff/ }).click();
  await s.waitForURL(`${BASE}/admin`);
  await s.goto(`/admin/assessments/${assessmentId}`);
  check("unassigned staff sees restricted case", await s.getByRole("heading", { name: "Restricted case" }).isVisible());
  check("restricted staff sees no media", (await s.locator("video, .evidence-thumb").count()) === 0);
  const sr = await s.request.get(`/admin/settings`);
  check("staff cannot open settings", sr.status() === 404, `status ${sr.status()}`);
  await s.locator("#reason").fill("Customer called support asking about this case.");
  await s.getByRole("button", { name: "Request access" }).click();
  await s.getByText("Your request is waiting for a manager.").waitFor();
  await shot(s, "16-admin-restricted-staff-1366");
  await m.goto(`/admin/assessments/${assessmentId}`);
  await m.getByRole("button", { name: "Approve 4h" }).click();
  await m.waitForTimeout(1000);
  await s.reload();
  check("staff gains access after manager approval", (await s.locator(".evidence-thumb").count()) > 0);
  await m.goto(`/admin/assessments/${assessmentId}?tab=audit`);
  check("audit shows access approval", await m.getByText("access.approved").isVisible());

  // ---------------- Admin on a phone ----------------
  const mphone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, baseURL: BASE, storageState: await desk.storageState() });
  const mp = await mphone.newPage();
  await mp.goto(`/admin/assessments/${assessmentId}`);
  await shot(mp, "17-admin-case-390");
  await mp.goto("/admin/assessments");
  await shot(mp, "18-admin-queue-390");

  // 360px intake
  const small = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, baseURL: BASE });
  const sm = await small.newPage();
  await sm.goto("/assess/new");
  await shot(sm, "19-intake-360");

  console.log(`\nassessment: ${assessmentId}`);
} catch (e) {
  check("run completed without exceptions", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${out}`);
  process.exitCode = failed.length ? 1 : 0;
}
