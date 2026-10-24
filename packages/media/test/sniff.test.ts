import { describe, expect, it } from "vitest";
import { assignScenes, selectFrames, sniff } from "../src";

const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(`ftyp${brand}`, "ascii")]);

describe("sniff (signature, not extension)", () => {
  it("detects common formats", () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniff(ftyp("isom"))?.kind).toBe("video");
    expect(sniff(ftyp("qt  "))?.mime).toBe("video/quicktime");
    expect(sniff(ftyp("heic"))?.mime).toBe("image/heic");
  });
  it("rejects executables, HTML and PDFs disguised as media", () => {
    expect(sniff(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]))).toBeNull();
    expect(sniff(Buffer.from("<html><script>", "ascii"))).toBeNull();
    expect(sniff(Buffer.from("%PDF-1.7", "ascii"))).toBeNull();
  });
});

describe("frame selection", () => {
  it("prefers the sharpest usable frame per scene and respects the cap", () => {
    const frames = [
      { sharpness: 1, flags: [], sceneIndex: 0, timestampMs: 0 },
      { sharpness: 5, flags: [], sceneIndex: 0, timestampMs: 2000 },
      { sharpness: 9, flags: ["too_dark"], sceneIndex: 1, timestampMs: 4000 },
      { sharpness: 3, flags: [], sceneIndex: 1, timestampMs: 6000 },
      { sharpness: 4, flags: [], sceneIndex: 2, timestampMs: 8000 },
    ];
    const chosen = selectFrames(frames, 2);
    expect(chosen.size).toBe(2);
    expect(chosen.has(1)).toBe(true);
    expect(chosen.has(2)).toBe(false);
  });
  it("starts new scenes on large hash changes", () => {
    expect(assignScenes(["0000000000000000", "0000000000000001", "ffffffffffffffff"])).toEqual([0, 0, 1]);
  });
});
