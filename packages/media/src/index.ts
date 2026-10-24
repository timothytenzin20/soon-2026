import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import sharp from "sharp";

/** PLAN §7.1 ValidateMedia + PrepareMedia. Pure media helpers; no DB access here. */

export type SniffedType =
  | { kind: "image"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" }
  | { kind: "video"; mime: "video/mp4" | "video/quicktime" | "video/webm" };

/** Identify by file signature, never by extension or client-declared MIME. */
export function sniff(head: Buffer): SniffedType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", mime: "image/png" };
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return { kind: "video", mime: "video/webm" };
  if (head.length >= 12 && head.toString("ascii", 4, 8) === "ftyp") {
    const brand = head.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "mif1", "msf1", "heis"].includes(brand)) return { kind: "image", mime: "image/heic" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |dash|3gp\d|3g2\w|MSNV|f4v )$/.test(brand)) return { kind: "video", mime: "video/mp4" };
  }
  return null;
}

export const ALLOWED_DECLARED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;

export async function readHead(file: string, bytes = 64): Promise<Buffer> {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest("hex");
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${path.basename(bin)} timed out`));
    }, timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

const FFMPEG = (ffmpegPath as unknown as string) ?? "ffmpeg";
const FFPROBE = ffprobeStatic.path;

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  videoCodec: string | null;
  formatName: string;
}

export async function probeVideo(file: string): Promise<ProbeResult> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 60_000);
  const j = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }[];
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  if (!v) throw new MediaRejection("no_video_stream", "The file has no video track.");
  const dur = Number(j.format?.duration ?? v.duration ?? NaN);
  if (!Number.isFinite(dur) || dur <= 0) throw new MediaRejection("unreadable_duration", "Could not read the video length.");
  return {
    durationMs: Math.round(dur * 1000),
    width: v.width ?? 0,
    height: v.height ?? 0,
    hasAudio: !!j.streams?.some((s) => s.codec_type === "audio"),
    videoCodec: v.codec_name ?? null,
    formatName: j.format?.format_name ?? "",
  };
}

export class MediaRejection extends Error {
  constructor(
    readonly code: string,
    readonly customerMessage: string,
  ) {
    super(code);
    this.name = "MediaRejection";
  }
}

/** Privacy-preserving proxy for playback: H.264, ≤1280px, audio stripped, faststart. */
export async function transcodeProxy(input: string, output: string): Promise<void> {
  await run(
    FFMPEG,
    ["-y", "-i", input, "-map_metadata", "-1", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", output],
    15 * 60_000,
  );
}

export interface ExtractedFrame {
  file: string;
  timestampMs: number;
}

/** Sample one frame every `intervalS` seconds, scaled to ≤960px wide. */
export async function extractFrames(input: string, outDir: string, intervalS: number, durationMs: number): Promise<ExtractedFrame[]> {
  await fs.mkdir(outDir, { recursive: true });
  await run(FFMPEG, ["-y", "-i", input, "-vf", `fps=1/${intervalS},scale='min(960,iw)':-2`, "-q:v", "3", path.join(outDir, "f_%05d.jpg")], 15 * 60_000);
  const files = (await fs.readdir(outDir)).filter((f) => f.startsWith("f_")).sort();
  // fps filter emits frame i at t ≈ i*interval (first frame at t=0).
  return files
    .map((f, i) => ({ file: path.join(outDir, f), timestampMs: Math.min(Math.round(i * intervalS * 1000), Math.max(0, durationMs - 1)) }))
    .filter((f) => f.timestampMs < durationMs);
}

export interface FrameQuality {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  flags: string[];
  /** 64-bit average hash (hex) for near-duplicate / scene detection. */
  ahash: string;
}

export async function analyzeImage(file: string | Buffer): Promise<FrameQuality> {
  const img = sharp(file).rotate();
  const meta = await img.metadata();
  const stats = await img.clone().stats();
  const brightness = stats.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / Math.min(3, stats.channels.length);
  const small = await img.clone().greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const avg = small.reduce((s, v) => s + v, 0) / small.length;
  let bits = "";
  for (const v of small) bits += v > avg ? "1" : "0";
  const ahash = BigInt(`0b${bits}`).toString(16).padStart(16, "0");
  const flags: string[] = [];
  if (brightness < 45) flags.push("too_dark");
  if (brightness > 235) flags.push("overexposed");
  if (stats.sharpness < 0.15) flags.push("blurry"); // sharp's metric: sample stills ≈0.5 to 0.7, video median ≈0.28
  if ((meta.width ?? 0) < 320) flags.push("low_resolution");
  return { width: meta.width ?? 0, height: meta.height ?? 0, sharpness: stats.sharpness, brightness, flags, ahash };
}

export function hammingHex(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Assign scene indices: a new scene starts when the average hash changes substantially. */
export function assignScenes(hashes: string[], threshold = 18): number[] {
  const scenes: number[] = [];
  let scene = 0;
  for (let i = 0; i < hashes.length; i++) {
    if (i > 0 && hammingHex(hashes[i]!, hashes[i - 1]!) > threshold) scene++;
    scenes.push(scene);
  }
  return scenes;
}

/**
 * Pick at most `max` frames: the sharpest usable frame of each scene first,
 * then fill by sharpness across time buckets. Deterministic.
 */
export function selectFrames<T extends { sharpness: number; flags: string[]; sceneIndex: number; timestampMs: number }>(frames: T[], max: number): Set<number> {
  const usable = (f: T) => !f.flags.includes("too_dark") && !f.flags.includes("overexposed");
  const chosen = new Set<number>();
  const bestPerScene = new Map<number, number>();
  frames.forEach((f, i) => {
    if (!usable(f)) return;
    const cur = bestPerScene.get(f.sceneIndex);
    if (cur === undefined || frames[cur]!.sharpness < f.sharpness) bestPerScene.set(f.sceneIndex, i);
  });
  const sceneBest = [...bestPerScene.values()].sort((a, b) => frames[b]!.sharpness - frames[a]!.sharpness);
  for (const i of sceneBest) {
    if (chosen.size >= max) break;
    chosen.add(i);
  }
  if (chosen.size < max) {
    const rest = frames
      .map((f, i) => ({ f, i }))
      .filter(({ f, i }) => usable(f) && !chosen.has(i) && !f.flags.includes("blurry"))
      .sort((a, b) => b.f.sharpness - a.f.sharpness);
    for (const { i } of rest) {
      if (chosen.size >= max) break;
      // keep temporal spread: skip frames within 3s of an already-chosen frame
      if ([...chosen].some((c) => Math.abs(frames[c]!.timestampMs - frames[i]!.timestampMs) < 3000)) continue;
      chosen.add(i);
    }
  }
  return chosen;
}

/** Re-encode a still: applies EXIF orientation, strips ALL metadata (incl. GPS), caps size. */
export async function normalizeImage(input: string | Buffer, maxDim = 2000): Promise<Buffer> {
  return sharp(input).rotate().resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

/** Downscaled copy for the vision model (bounded size → bounded cost). */
export async function visionImage(input: string | Buffer, maxDim = 1024): Promise<Buffer> {
  return sharp(input).rotate().resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

export async function makeTempDir(prefix = "mb-media-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
