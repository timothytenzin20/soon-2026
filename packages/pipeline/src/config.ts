/** Provisional limits (PLAN §4, §15.6), configurable, to be confirmed by load tests and the business. */
export interface PipelineConfig {
  maxUploadBytes: number;
  maxVideoSeconds: number;
  frameIntervalSeconds: number;
  maxFramesPerVideo: number;
  maxFramesPerRun: number;
  budgetUsdPerRun: number;
  appUrl: string;
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function readPipelineConfig(env: Record<string, string | undefined> = process.env): PipelineConfig {
  const maxFramesPerRun = num(env.AI_MAX_FRAMES_PER_RUN, 12);
  return {
    maxUploadBytes: num(env.MEDIA_MAX_UPLOAD_BYTES, 500 * 1024 * 1024),
    maxVideoSeconds: num(env.MEDIA_MAX_VIDEO_SECONDS, 600),
    frameIntervalSeconds: num(env.MEDIA_FRAME_INTERVAL_SECONDS, 2),
    maxFramesPerVideo: maxFramesPerRun,
    maxFramesPerRun,
    budgetUsdPerRun: num(env.AI_BUDGET_USD_PER_RUN, 1.5),
    appUrl: env.APP_URL ?? "http://localhost:3100",
  };
}
