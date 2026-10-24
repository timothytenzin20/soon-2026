/**
 * Sample-pack demonstration (PLAN §12): runs the silent virtual walkthrough + 3 stills
 * through the real pipeline as an anonymous customer would, WITHOUT the reference report
 * or job findings in any input. Prints the resulting case link for the admin workspace.
 *
 * Usage: pnpm demo:sample   (requires Postgres running + seed; worker NOT required, jobs are drained here)
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { assessments, createDb, reportVersions } from "@mb/db";
import type { Principal } from "@mb/domain";
import {
  appendUploadChunk,
  completeUpload,
  createAssessment,
  createUploadSession,
  drain,
  getOpenQuestions,
  readPipelineConfig,
  seedBase,
  submitAnswers,
  submitAssessment,
} from "@mb/pipeline";
import { getStore } from "@mb/storage";

const root = path.resolve(import.meta.dirname, "..");
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
const sample = path.join(root, "reference/Mold-Busters-Hackathon-Sample-Pack-v2/02_Virtual_Sample");
const files = [
  { file: "Videos/Walkthrough_Silent.mp4", mime: "video/mp4", area: "laundry" },
  { file: "Photos/01_Discoloration_dryer_vent_hose.jpg", mime: "image/jpeg", area: "laundry" },
  { file: "Photos/02_Discoloration_ceiling_vent.jpg", mime: "image/jpeg", area: "hvac_vents" },
  { file: "Photos/03_Discoloration_vent_grille.jpg", mime: "image/jpeg", area: "hvac_vents" },
];
if (!fs.existsSync(path.join(sample, files[0]!.file))) {
  console.error(`Sample pack not found under ${sample}. Unzip Mold-Busters-Hackathon-Sample-Pack-v2.zip into ./reference first.`);
  process.exit(1);
}

const h = createDb();
await h.migrate();
const { org } = await seedBase(h.db);
const deps = { db: h.db, store: getStore(), cfg: readPipelineConfig() };

// Intake mirrors what the tenant reported on the booking form (job_timeline.json → client_concern),
// restricted to the approved enums. Reference findings/report are NOT used.
const { assessment, customerId } = await createAssessment(h.db, { kind: "anonymous" }, {
  propertyType: "apartment",
  region: "QC",
  areas: ["laundry", "hvac_vents", "kitchen"],
  concerns: ["musty_odor", "visible_spots"],
  statement: "Strong smell that doesn't go away after cleaning. Spots around the washer and dryer, in the vents and around the oven.",
  consentAiProcessing: true,
  consentMediaStorage: true,
});
const p: Principal = { kind: "customer", orgId: org.id, customerId, emailVerified: false };
for (const f of files) {
  const data = fs.readFileSync(path.join(sample, f.file));
  const s = await createUploadSession(h.db, p, deps.cfg, assessment.id, { fingerprint: `${f.file}:${data.length}`, mime: f.mime, size: data.length, area: f.area });
  for (let off = s.receivedBytes; off < data.length; ) off = (await appendUploadChunk(h.db, deps.store, p, s.id, off, data.subarray(off, off + 4 * 1024 * 1024))).receivedBytes;
  await completeUpload(h.db, deps.store, p, s.id);
  console.log(`uploaded ${f.file}`);
}
await submitAssessment(h.db, p, assessment.id);
const t0 = Date.now();
await drain(deps);
const [afterObserve] = await h.db.select().from(assessments).where(eq(assessments.id, assessment.id));
if (afterObserve!.status === "failed") {
  console.error(`\nScreening failed: ${afterObserve!.lastErrorCode}. Run \`pnpm ai:check\` to verify the AI model setup.`);
  await h.close();
  process.exit(1);
}
const q = await getOpenQuestions(h.db, p, assessment.id);
console.log(`questions selected: ${q.open.map((x) => x.id).join(", ")}`);
// The sample pack doesn't contain answers to these; record "not sure" except facts stated in the job record (tenant).
await submitAnswers(h.db, p, assessment.id, {
  answers: q.open.map((x) => ({ questionId: x.id, value: x.id === "occupancy" ? "rent" : x.kind === "multi" ? ["not_sure"] : "not_sure" })),
  finish: true,
});
await drain(deps);
const [a] = await h.db.select().from(assessments).where(eq(assessments.id, assessment.id));
const [rv] = await h.db.select().from(reportVersions).where(eq(reportVersions.assessmentId, assessment.id));
console.log(`\nstatus: ${a!.status}  outcome: ${rv?.outcome}  processing time (this machine): ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`model: ${process.env.AI_PROVIDER ?? "mock"}`);
console.log(`admin case:  ${process.env.APP_URL ?? "http://localhost:3100"}/admin/assessments/${a!.id}`);
await h.close();
