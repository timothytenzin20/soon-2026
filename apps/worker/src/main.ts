import os from "node:os";
import { createDb, recoverStaleJobs, setDbHandle } from "@mb/db";
import { aiStatus } from "@mb/ai";
import { log } from "@mb/observability";
import { MEDIA_JOB_TYPES, MODEL_JOB_TYPES, readPipelineConfig, runOnce, type PipelineDeps } from "@mb/pipeline";
import { getStore } from "@mb/storage";

/**
 * Background worker (PLAN §4). Separate compute profiles: media (FFmpeg) and model jobs
 * run in independent loops with bounded concurrency. Scale by running more processes;
 * jobs are claimed with SKIP LOCKED so this is safe.
 */
const handle = createDb();
setDbHandle(handle);
const deps: PipelineDeps = { db: handle.db, store: getStore(), cfg: readPipelineConfig() };
const workerId = `${os.hostname()}:${process.pid}`;
const MEDIA_CONCURRENCY = Number(process.env.WORKER_MEDIA_CONCURRENCY ?? 1);
const MODEL_CONCURRENCY = Number(process.env.WORKER_MODEL_CONCURRENCY ?? 2);
let stopping = false;

async function loop(name: string, types: readonly string[]) {
  while (!stopping) {
    try {
      const didWork = await runOnce(deps, `${workerId}:${name}`, types);
      if (!didWork) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      log.error("worker.loop_error", { loop: name, error: e });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  if (handle.driver === "pglite") log.warn("worker.pglite_single_process_only");
  await handle.migrate();
  const ai = aiStatus();
  log.info("worker.started", { workerId, MEDIA_CONCURRENCY, MODEL_CONCURRENCY, ai });
  if (!ai.configured) {
    console.error(
      ["", `  AI MODEL NOT CONFIGURED: set ${ai.keyVar} in .env, then run pnpm ai:check.`, "  Submitted screenings will fail with 'ai_not_configured' until then.", ""].join("\n"),
    );
  } else if (ai.provider === "mock") {
    console.error(["", "  AI_PROVIDER=mock: using the offline pixel heuristic, not a real AI model.", ""].join("\n"));
  }
  const recover = setInterval(() => recoverStaleJobs(deps.db, 20 * 60_000).catch(() => {}), 60_000);
  const loops = [
    ...Array.from({ length: MEDIA_CONCURRENCY }, (_, i) => loop(`media${i}`, MEDIA_JOB_TYPES)),
    ...Array.from({ length: MODEL_CONCURRENCY }, (_, i) => loop(`model${i}`, MODEL_JOB_TYPES)),
  ];
  const shutdown = () => {
    stopping = true;
    clearInterval(recover);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await Promise.all(loops);
  await handle.close();
  log.info("worker.stopped");
}

void main();
