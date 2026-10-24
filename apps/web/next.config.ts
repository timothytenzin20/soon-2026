import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Single source of configuration: the repository-root .env (shared with the worker).
const repoRoot = path.resolve(__dirname, "../..");
const envFile = path.join(repoRoot, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.STORAGE_ROOT && !path.isAbsolute(process.env.STORAGE_ROOT)) {
  process.env.STORAGE_ROOT = path.resolve(repoRoot, process.env.STORAGE_ROOT);
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  transpilePackages: ["@mb/domain", "@mb/db", "@mb/ai", "@mb/media", "@mb/storage", "@mb/pipeline", "@mb/reporting", "@mb/payments", "@mb/integrations", "@mb/ui", "@mb/observability"],
  serverExternalPackages: ["sharp", "ffmpeg-static", "ffprobe-static", "@electric-sql/pglite", "pg", "@anthropic-ai/sdk", "openai"],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
