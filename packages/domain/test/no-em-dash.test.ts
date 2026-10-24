import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** House style: no em dashes anywhere in source, UI copy or docs. */
const root = path.resolve(__dirname, "../../..");
const SKIP = new Set(["node_modules", ".next", ".data", "reference", ".git", "drizzle"]);
const EXT = /\.(ts|tsx|css|md)$/;
const EM_DASH = String.fromCharCode(0x2014);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

describe("style", () => {
  it("contains no em dashes", () => {
    const offenders = ["apps", "packages", "scripts", "docs"]
      .flatMap((d) => walk(path.join(root, d)))
      .concat(path.join(root, "README.md"))
      .filter((f) => fs.readFileSync(f, "utf8").includes(EM_DASH))
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});
