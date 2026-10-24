# ADR-0006: Anthropic Claude as first VisionModel; mock by default

Status: accepted

## Decision
- `VisionModel` interface (`packages/ai`). First real adapter: Anthropic SDK `beta.messages.parse` with Zod structured outputs, default model `claude-opus-5-5`, effort `medium`, server-side refusal fallback (`fallbacks: "default"`), refusal/truncation handling, token-based cost estimate per run.
- Short frame aliases (F1…Fn) instead of DB IDs; unknown aliases dropped.
- Default `AI_PROVIDER=mock`: a labelled pixel heuristic so the system runs offline. Mock output can never yield a `qualified` report.

## Open
Model choice/budget is a business decision (PLAN §15.6). Pricing table in code is a cached snapshot (2026-10-06), verify before using for billing analytics. No real-model evaluation has been run yet (no API key in this environment).

## Update 2026-10-24: OpenAI default
The default provider is now OpenAI (`AI_PROVIDER=openai`, `gpt-4.1`) via `packages/ai/src/openai.ts`: Chat Completions with strict JSON-schema output, base64 images, refusal / length / content-filter handling, and length limits enforced after parsing. Prompts and schemas are shared with the Claude adapter (`packages/ai/src/prompts.ts`), so outputs are comparable across providers.
