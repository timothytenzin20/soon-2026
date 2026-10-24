import OpenAI from "openai";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { aiStatus, getTextModel, getVisionModel, ModelError } from "../src";
import { OpenAITextModel, OpenAIVisionModel } from "../src/openai";

/** Simulated Chat Completions API: records requests, returns a canned structured answer. */
function fakeClient(reply: unknown, opts: { status?: number; finish?: string; refusal?: string } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const client = new OpenAI({
    apiKey: "sk-test",
    maxRetries: 0,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (opts.status) {
        return new Response(JSON.stringify({ error: { message: "Incorrect API key provided", type: "invalid_request_error" } }), { status: opts.status, headers: { "content-type": "application/json" } });
      }
      const body = {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: "gpt-4.1-2025-04-14",
        choices: [{ index: 0, finish_reason: opts.finish ?? "stop", message: { role: "assistant", content: opts.refusal ? null : JSON.stringify(reply), refusal: opts.refusal ?? null } }],
        usage: { prompt_tokens: 10000, completion_tokens: 800, total_tokens: 10800 },
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  return { client, calls };
}

const jpeg = () => sharp({ create: { width: 32, height: 32, channels: 3, background: "#ccc" } }).jpeg().toBuffer();

describe("OpenAIVisionModel (gpt-4.1)", () => {
  it("sends images + strict JSON schema, maps frame aliases back, filters ranking, clamps verbosity", async () => {
    const { client, calls } = fakeClient({
      observations: [
        { frameId: "F1", category: "discoloration", location: "vent grille slats", neutralDescription: "Dark speckling. ".repeat(60), visibility: "good", strength: "moderate", alternativeExplanations: ["Dust"], limitations: [], region: { x: 0.2, y: 0.3, width: 0.5, height: 0.25 } },
        { frameId: "F7", category: "staining", location: "x", neutralDescription: "Invented frame.", visibility: "good", strength: "weak", alternativeExplanations: [], limitations: [], region: null },
      ],
      frames: [
        { frameId: "F1", usable: true, issue: null, privacyConcern: false },
        { frameId: "F2", usable: true, issue: null, privacyConcern: true },
      ],
      overallLimitations: [],
      questionPriority: ["dryer_vent", "not_a_question"],
    });
    const img = await jpeg();
    const res = await new OpenAIVisionModel("gpt-4.1", client, {}).observe({
      frames: [
        { frameId: "frame-a", image: img, sourceLabel: "Video 1 at 0:46" },
        { frameId: "frame-b", image: img, sourceLabel: "Photo 1" },
      ],
      areas: ["laundry"],
      concerns: ["musty_odor"],
      budgetUsd: 1,
      candidateQuestions: [{ id: "dryer_vent", text: "Does the dryer vent outdoors?" }],
    });

    const req = calls[0]!;
    expect(req.url).toContain("/chat/completions");
    expect(req.body.model).toBe("gpt-4.1");
    const rf = req.body.response_format as { type: string; json_schema: { strict: boolean; schema: Record<string, unknown> } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(JSON.stringify(rf.json_schema.schema)).not.toMatch(/maxLength|maxItems|\$schema/);
    const userContent = (req.body.messages as { role: string; content: { type: string; image_url?: { url: string } }[] }[])[1]!.content;
    expect(userContent.filter((b) => b.type === "image_url")).toHaveLength(2);
    expect(userContent.find((b) => b.type === "image_url")!.image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(JSON.stringify(req.body)).not.toContain("frame-a");

    expect(res.provider).toBe("openai");
    expect(res.result.observations).toHaveLength(1);
    expect(res.result.observations[0]!.frameId).toBe("frame-a");
    expect(res.result.observations[0]!.neutralDescription.length).toBeLessThanOrEqual(400);
    expect(res.result.frames.find((f) => f.frameId === "frame-b")!.privacyConcern).toBe(true);
    expect(res.result.questionPriority).toEqual(["dryer_vent"]);
    expect(res.result.observations[0]!.region).toEqual({ x: 0.2, y: 0.3, width: 0.5, height: 0.25 });
    expect(res.usage.costUsd).toBeCloseTo((10000 * 2 + 800 * 8) / 1e6, 6);
  });

  it("maps refusal, truncation and a bad key to model errors", async () => {
    const img = await jpeg();
    const req = { frames: [{ frameId: "a", image: img, sourceLabel: "Photo 1" }], areas: [], concerns: [], budgetUsd: 1 };
    await expect(new OpenAIVisionModel("gpt-4.1", fakeClient({}, { refusal: "I can't help with that" }).client, {}).observe(req)).rejects.toMatchObject({ code: "refusal" });
    await expect(new OpenAIVisionModel("gpt-4.1", fakeClient({}, { finish: "length" }).client, {}).observe(req)).rejects.toMatchObject({ code: "truncated", retryable: true });
    const err = await new OpenAIVisionModel("gpt-4.1", fakeClient({}, { status: 401 }).client, {}).observe(req).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.code).toBe("not_configured");
  });
});

describe("OpenAITextModel", () => {
  it("returns a structured summary", async () => {
    const { client } = fakeClient({ headline: "Your photos show dark spotting on a vent.", points: ["You reported a musty smell.", "A professional can check the ducts."] });
    const res = await new OpenAITextModel("gpt-4.1", client, {}).summarize({ outcome: "qualified", priority: "soon", findings: [], reportedConcerns: [], answers: [], unknowns: [] });
    expect(res.summary.points).toHaveLength(2);
    expect(res.provider).toBe("openai");
  });
});

describe("provider selection", () => {
  it("defaults to OpenAI gpt-4.1 and fails loudly without a key", async () => {
    const s = aiStatus({});
    expect(s).toMatchObject({ provider: "openai", configured: false, keyVar: "OPENAI_API_KEY", visionModel: "gpt-4.1", textModel: "gpt-4.1" });
    await expect(getVisionModel({}).observe({ frames: [], areas: [], concerns: [], budgetUsd: 1 })).rejects.toMatchObject({ code: "not_configured" });
    expect(getVisionModel({ OPENAI_API_KEY: "sk-x" }).provider).toBe("openai");
    expect(getVisionModel({ OPENAI_API_KEY: "sk-x", OPENAI_VISION_MODEL: "gpt-4.1-mini" }).model).toBe("gpt-4.1-mini");
    expect(getVisionModel({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x" }).provider).toBe("anthropic");
    expect(getVisionModel({ AI_PROVIDER: "mock" }).provider).toBe("mock");
    expect(getTextModel({ AI_PROVIDER: "mock" })).toBeNull();
  });
});
