/** Verifies the configured AI model with one tiny live request. Usage: pnpm ai:check */
import fs from "node:fs";
import path from "node:path";
import { aiStatus, checkConnection } from "@mb/ai";

const env = path.resolve(import.meta.dirname, "../.env");
if (fs.existsSync(env)) process.loadEnvFile(env);
const s = aiStatus();
console.log(`provider: ${s.provider}  vision: ${s.visionModel}  text: ${s.textModel}`);
const r = await checkConnection();
console.log(`${r.ok ? "OK" : "NOT READY"}: ${r.detail}`);
process.exitCode = r.ok ? 0 : 1;
