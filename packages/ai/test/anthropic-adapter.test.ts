import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AnthropicTextModel, AnthropicVisionModel, ModelError } from "../src";

/** Simulated Messages API: records the request, returns a canned structured response. */
function fakeClient(reply: unknown, opts: { status?: number; stopReason?: string } = {}) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      calls.push({ url: String(url), headers, body: JSON.parse(String(init?.body)) });
      if (opts.status && opts.status !== 200) {
        return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: opts.status, headers: { "content-type": "application/json" } });
      }
      const msg = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(reply) }],
        stop_reason: opts.stopReason ?? "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 12000, output_tokens: 900 },
      };
      return new Response(JSON.stringify(msg), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  return { client, calls };
}

const jpeg = () => sharp({ create: { width: 32, height: 32, channels: 3, background: "#ccc" } }).jpeg().toBuffer();

describe("AnthropicVisionModel", () => {
  it("sends images, approved candidates, structured-output schema and fallback; maps aliases back", async () => {
    const { client, calls } = fakeClient({
      observations: [
        { frameId: "F1", category: "discoloration", location: "vent grille slats", neutralDescription: "Dark speckling along the slats.", visibility: "good", strength: "moderate", alternativeExplanations: ["Dust"], limitations: [], region: null },
        { frameId: "F9", category: "staining", location: "x", neutralDescription: "Invented frame.", visibility: "good", strength: "weak", alternativeExplanations: [], limitations: [], region: null },
      ],
      frames: [
        { frameId: "F1", usable: true, issue: null, privacyConcern: false },
        { frameId: "F2", usable: true, issue: null, privacyConcern: true },
      ],
      overallLimitations: ["Low resolution"],
      questionPriority: ["hvac_maintenance", "made_up_question", "dryer_vent"],
    });
    const model = new AnthropicVisionModel("claude-opus-5-5", client);
    const img = await jpeg();
    const res = await model.observe({
      frames: [
        { frameId: "frame-a", image: img, sourceLabel: "Video 1 at 0:46" },
        { frameId: "frame-b", image: img, sourceLabel: "Photo 1" },
      ],
      areas: ["hvac_vents"],
      concerns: ["musty_odor"],
      budgetUsd: 1,
      candidateQuestions: [
        { id: "hvac_maintenance", text: "When were vents or filters last cleaned?" },
        { id: "dryer_vent", text: "Does the dryer vent outdoors?" },
      ],
    });

    const req = calls[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    expect((req.body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const content = (req.body.messages as { content: { type: string; text?: string }[] }[])[0]!.content;
    expect(content.filter((b) => b.type === "image")).toHaveLength(2);
    expect(content[0]!.text).toContain("hvac_maintenance: When were vents");
    expect(JSON.stringify(req.body)).not.toContain("frame-a"); // DB ids never sent

    expect(res.result.observations).toHaveLength(1); // F9 dropped
    expect(res.result.observations[0]!.frameId).toBe("frame-a");
    expect(res.result.frames.find((f) => f.frameId === "frame-b")!.privacyConcern).toBe(true);
    expect(res.result.questionPriority).toEqual(["hvac_maintenance", "dryer_vent"]); // unknown id discarded
    expect(res.usage.costUsd).toBeCloseTo((12000 * 4 + 900 * 20) / 1e6, 6);
    expect(res.isMock).toBe(false);
  });

  it("maps refusal and truncation to model errors", async () => {
    const img = await jpeg();
    const req = { frames: [{ frameId: "a", image: img, sourceLabel: "Photo 1" }], budgetUsd: 1 };
    const refused = new AnthropicVisionModel("claude-opus-5-5", fakeClient({}, { stopReason: "refusal" }).client);
    await expect(refused.observe({ ...req, areas: [], concerns: [] })).rejects.toMatchObject({ code: "refusal", retryable: false });
    const cut = new AnthropicVisionModel("claude-opus-5-5", fakeClient({}, { stopReason: "max_tokens" }).client);
    await expect(cut.observe({ ...req, areas: [], concerns: [] })).rejects.toMatchObject({ code: "truncated", retryable: true });
  });

  it("treats a rejected API key as not configured (non-retryable)", async () => {
    const img = await jpeg();
    const bad = new AnthropicVisionModel("claude-opus-5-5", fakeClient({}, { status: 401 }).client);
    const err = await bad.observe({ frames: [{ frameId: "a", image: img, sourceLabel: "x" }], areas: [], concerns: [], budgetUsd: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.code).toBe("not_configured");
  });
});

describe("AnthropicTextModel", () => {
  it("returns a structured summary", async () => {
    const { client, calls } = fakeClient({ headline: "Your photos show dark spotting on two vent grilles.", points: ["You reported a musty smell.", "A professional can check inside the ducts."] });
    const res = await new AnthropicTextModel("claude-opus-5-5", client).summarize({ outcome: "qualified", priority: "soon", findings: [], reportedConcerns: [], answers: [], unknowns: [] });
    expect(res.summary.points).toHaveLength(2);
    expect((calls[0]!.body.output_config as { effort: string }).effort).toBe("low");
  });
});
